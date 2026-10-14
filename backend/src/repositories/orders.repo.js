const { pool, withTransaction } = require('../config/db');
const { generateOrderNumber } = require('../utils/codes');
const couponsRepo = require('./coupons.repo');
const { AppError } = require('../middleware/errorHandler');

// Creates the order, its line items, and the first status-history row atomically.
// Retries the human-friendly order_number on the rare unique-constraint collision.
// idempotencyKey (sent by the client, e.g. a UUID generated when checkout starts)
// means a network retry of the same checkout click never creates a duplicate order.
async function createOrder({ customer, fulfillment, pricing, paymentMethod, couponId, idempotencyKey }) {
  if (idempotencyKey) {
    const existing = await pool.query('SELECT * FROM orders WHERE idempotency_key = $1', [idempotencyKey]);
    if (existing.rows[0]) return getOrderWithItems(existing.rows[0].id);
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const orderNumber = generateOrderNumber();
    try {
      const order = await withTransaction(async (client) => {
        const { rows } = await client.query(
          `INSERT INTO orders (
             order_number, user_id, guest_name, guest_mobile, guest_email,
             fulfillment_type, delivery_address, delivery_landmark, delivery_locality, delivery_instructions,
             subtotal_paise, discount_paise, delivery_fee_paise, tax_paise, total_paise,
             coupon_id, payment_method, idempotency_key
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
           RETURNING *`,
          [
            orderNumber, customer.userId || null, customer.guestName || null, customer.guestMobile || null, customer.guestEmail || null,
            fulfillment.type, fulfillment.address || null, fulfillment.landmark || null, fulfillment.locality || null, fulfillment.instructions || null,
            pricing.subtotalPaise, pricing.discountPaise, pricing.deliveryFeePaise, pricing.taxPaise, pricing.totalPaise,
            couponId || null, paymentMethod, idempotencyKey || null
          ]
        );
        const order = rows[0];

        for (const line of pricing.lines) {
          const { rows: inventoryRows } = await client.query(
            `UPDATE item_variants
             SET stock_quantity = CASE
               WHEN stock_quantity IS NULL THEN NULL ELSE stock_quantity - $1
             END
             WHERE id = $2 AND is_available = true
               AND (stock_quantity IS NULL OR stock_quantity >= $1)
               AND EXISTS (
                 SELECT 1 FROM menu_items mi
                 WHERE mi.id = item_variants.item_id AND mi.is_available = true
               )
             RETURNING stock_quantity`,
            [line.quantity, line.variantId]
          );
          if (!inventoryRows[0]) {
            throw new AppError(`${line.itemName} no longer has enough stock`, 409);
          }
          const stockReserved = inventoryRows[0].stock_quantity !== null;
          await client.query(
            `INSERT INTO order_items (
               order_id, menu_item_id, variant_id, stock_reserved, item_name_snapshot, variant_name_snapshot,
               unit_price_paise, quantity, addons_snapshot, special_instructions, line_total_paise
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              order.id, line.menuItemId || null, line.variantId, stockReserved, line.itemName, line.variantName,
              line.unitPricePaise, line.quantity, JSON.stringify(line.addons), line.specialInstructions || null, line.lineTotalPaise
            ]
          );
        }

        await client.query(
          'INSERT INTO order_status_history (order_id, status, note) VALUES ($1, $2, $3)',
          [order.id, 'placed', 'Order placed by customer']
        );

        await client.query(
          "INSERT INTO payments (order_id, method, status, amount_paise) VALUES ($1, $2, 'pending', $3)",
          [order.id, paymentMethod, pricing.totalPaise]
        );

        if (couponId) {
          await couponsRepo.incrementUsage(couponId, client);
        }

        return order;
      });
      return getOrderWithItems(order.id);
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'orders_order_number_key') {
        continue; // extremely rare collision — retry with a new order number
      }
      throw err;
    }
  }
  throw new Error('Could not generate a unique order number after 3 attempts');
}

async function getOrderWithItems(orderId) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
  if (!orderRows[0]) return null;
  const { rows: items } = await pool.query('SELECT * FROM order_items WHERE order_id = $1', [orderId]);
  const { rows: history } = await pool.query(
    'SELECT status, note, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at', [orderId]
  );
  return { ...orderRows[0], items, statusHistory: history };
}

async function findByOrderNumber(orderNumber) {
  const { rows } = await pool.query('SELECT id FROM orders WHERE order_number = $1', [orderNumber]);
  if (!rows[0]) return null;
  return getOrderWithItems(rows[0].id);
}

async function listForCustomer(userId) {
  const { rows } = await pool.query(
    `SELECT o.*,
       COALESCE((
         SELECT json_agg(json_build_object(
           'menu_item_id', oi.menu_item_id, 'item_name', oi.item_name_snapshot
         ) ORDER BY oi.item_name_snapshot)
         FROM order_items oi WHERE oi.order_id = o.id AND oi.menu_item_id IS NOT NULL
       ), '[]') AS items
     FROM orders o WHERE o.user_id = $1 ORDER BY o.created_at DESC LIMIT 50`,
    [userId]
  );
  return rows;
}

async function listForAdmin({ status, dateFrom, dateTo, search, limit = 50, offset = 0 } = {}) {
  const clauses = [];
  const params = [];
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  if (dateFrom) { params.push(dateFrom); clauses.push(`created_at >= $${params.length}`); }
  if (dateTo) { params.push(dateTo); clauses.push(`created_at <= $${params.length}`); }
  if (search) { params.push(`%${search}%`); clauses.push(`(order_number ILIKE $${params.length} OR guest_mobile ILIKE $${params.length})`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit, offset);
  const { rows } = await pool.query(
    `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

async function updateStatus(orderId, status, changedBy, note) {
  return withTransaction(async (client) => {
    const { rows: currentRows } = await client.query(
      'SELECT status FROM orders WHERE id = $1 FOR UPDATE',
      [orderId]
    );
    if (!currentRows[0]) return null;
    const { rows } = await client.query(
      'UPDATE orders SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, orderId]
    );
    if (status === 'cancelled' && currentRows[0].status !== 'cancelled') {
      await client.query(
        `UPDATE item_variants iv
         SET stock_quantity = iv.stock_quantity + reserved.quantity
         FROM (
           SELECT variant_id, SUM(quantity)::integer AS quantity
           FROM order_items
           WHERE order_id = $1 AND stock_reserved = true AND variant_id IS NOT NULL
           GROUP BY variant_id
         ) reserved
         WHERE iv.id = reserved.variant_id AND iv.stock_quantity IS NOT NULL`,
        [orderId]
      );
    }
    await client.query(
      'INSERT INTO order_status_history (order_id, status, changed_by, note) VALUES ($1,$2,$3,$4)',
      [orderId, status, changedBy || null, note || null]
    );
    return rows[0];
  });
}

async function markPaymentStatus(orderId, paymentStatus) {
  const { rows } = await pool.query(
    'UPDATE orders SET payment_status = $1, updated_at = now() WHERE id = $2 RETURNING *',
    [paymentStatus, orderId]
  );
  return rows[0] || null;
}

module.exports = {
  createOrder, getOrderWithItems, findByOrderNumber, listForCustomer,
  listForAdmin, updateStatus, markPaymentStatus
};
