const { pool } = require('../config/db');

async function listApprovedForItem(itemId) {
  const { rows } = await pool.query(
    `SELECT rating, review_text, created_at
     FROM menu_reviews
     WHERE menu_item_id = $1 AND status = 'approved'
     ORDER BY created_at DESC
     LIMIT 50`,
    [itemId]
  );
  return rows;
}

async function listForUser(userId) {
  const { rows } = await pool.query(
    `SELECT r.id, r.menu_item_id, mi.name AS item_name, r.rating, r.review_text,
            r.status, r.created_at
     FROM menu_reviews r
     JOIN menu_items mi ON mi.id = r.menu_item_id
     WHERE r.user_id = $1
     ORDER BY r.created_at DESC`,
    [userId]
  );
  return rows;
}

async function createForCompletedPurchase({ userId, itemId, orderId, rating, reviewText }) {
  const { rows } = await pool.query(
    `INSERT INTO menu_reviews (user_id, menu_item_id, order_id, rating, review_text)
     SELECT $1, $2, $3, $4, $5
     WHERE EXISTS (
       SELECT 1 FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       WHERE o.id = $3 AND o.user_id = $1 AND o.status = 'completed'
         AND oi.menu_item_id = $2
     )
     RETURNING id, menu_item_id, rating, review_text, status, created_at`,
    [userId, itemId, orderId, rating, reviewText]
  );
  return rows[0] || null;
}

async function listPending() {
  const { rows } = await pool.query(
    `SELECT r.id, r.menu_item_id, mi.name AS item_name, r.order_id, o.order_number,
            u.name AS customer_name, r.rating, r.review_text, r.created_at
     FROM menu_reviews r
     JOIN menu_items mi ON mi.id = r.menu_item_id
     JOIN orders o ON o.id = r.order_id
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at ASC`
  );
  return rows;
}

async function moderate(reviewId, status, moderatorId) {
  const { rows } = await pool.query(
    `UPDATE menu_reviews
     SET status = $1, moderated_by = $2, moderated_at = now()
     WHERE id = $3
     RETURNING id, menu_item_id, status, moderated_at`,
    [status, moderatorId, reviewId]
  );
  return rows[0] || null;
}

module.exports = { listApprovedForItem, listForUser, createForCompletedPurchase, listPending, moderate };
