const { pool } = require('../config/db');
const menuRepo = require('../repositories/menu.repo');
const ordersRepo = require('../repositories/orders.repo');
const reservationsRepo = require('../repositories/reservations.repo');
const settingsRepo = require('../repositories/settings.repo');
const reviewsRepo = require('../repositories/reviews.repo');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

async function logAction(actorId, action, entityType, entityId, details = {}) {
  await pool.query(
    'INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, details) VALUES ($1,$2,$3,$4,$5)',
    [actorId || null, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

// ---------- Overview ----------
const overview = asyncHandler(async (req, res) => {
  const [todayOrders, pendingOrders, revenueToday, pendingReservations, popular] = await Promise.all([
    pool.query("SELECT COUNT(*) FROM orders WHERE created_at::date = CURRENT_DATE"),
    pool.query("SELECT COUNT(*) FROM orders WHERE status IN ('placed','confirmed','preparing')"),
    pool.query("SELECT COALESCE(SUM(total_paise),0) AS total FROM orders WHERE payment_status = 'paid' AND created_at::date = CURRENT_DATE"),
    pool.query("SELECT COUNT(*) FROM reservations WHERE status = 'pending'"),
    pool.query("SELECT name, popularity_score FROM menu_items ORDER BY popularity_score DESC LIMIT 5")
  ]);
  res.json({
    todayOrders: Number(todayOrders.rows[0].count),
    pendingOrders: Number(pendingOrders.rows[0].count),
    revenueTodayPaise: Number(revenueToday.rows[0].total),
    pendingReservations: Number(pendingReservations.rows[0].count),
    popularDishes: popular.rows
  });
});

// ---------- Menu management ----------
const listMenuItems = asyncHandler(async (req, res) => {
  const items = await menuRepo.listItems({ sort: 'name', includeUnavailable: true });
  res.json({ items });
});

const createMenuItem = asyncHandler(async (req, res) => {
  const { categoryId, name, slug, description, isVegetarian, variants } = req.body;
  if (!categoryId || !name || !slug || !Array.isArray(variants) || variants.length === 0) {
    throw new AppError('categoryId, name, slug and at least one variant are required', 400);
  }
  const { rows } = await pool.query(
    `INSERT INTO menu_items (category_id, name, slug, description, is_vegetarian)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [categoryId, name, slug, description || null, Boolean(isVegetarian)]
  );
  const item = rows[0];
  for (const v of variants) {
    await pool.query(
      'INSERT INTO item_variants (item_id, variant_name, price_paise, is_default) VALUES ($1,$2,$3,$4)',
      [item.id, v.name, v.pricePaise, Boolean(v.isDefault)]
    );
  }
  await logAction(req.user.id, 'menu_item.created', 'menu_item', item.id, { name });
  res.status(201).json({ item: await menuRepo.getItemById(item.id) });
});

const updateMenuItem = asyncHandler(async (req, res) => {
  const { name, description, isVegetarian, isAvailable, isFeatured } = req.body;
  const { rows } = await pool.query(
    `UPDATE menu_items SET
       name = COALESCE($1, name), description = COALESCE($2, description),
       is_vegetarian = COALESCE($3, is_vegetarian), is_available = COALESCE($4, is_available),
       is_featured = COALESCE($5, is_featured), updated_at = now()
     WHERE id = $6 RETURNING *`,
    [name, description, isVegetarian, isAvailable, isFeatured, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Dish not found' });
  await logAction(req.user.id, 'menu_item.updated', 'menu_item', req.params.id, req.body);
  res.json({ item: await menuRepo.getItemById(req.params.id) });
});

const deleteMenuItem = asyncHandler(async (req, res) => {
  await pool.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
  await logAction(req.user.id, 'menu_item.deleted', 'menu_item', req.params.id);
  res.json({ ok: true });
});

const setVariantAvailability = asyncHandler(async (req, res) => {
  const { isAvailable } = req.body;
  const { rows } = await pool.query(
    'UPDATE item_variants SET is_available = $1 WHERE id = $2 RETURNING *',
    [Boolean(isAvailable), req.params.variantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Variant not found' });
  res.json({ variant: rows[0] });
});

const setVariantInventory = asyncHandler(async (req, res) => {
  const { stockQuantity } = req.body || {};
  if (stockQuantity !== null && (!Number.isInteger(stockQuantity) || stockQuantity < 0)) {
    throw new AppError('stockQuantity must be a non-negative whole number or null for unlimited stock', 400);
  }
  const { rows } = await pool.query(
    'UPDATE item_variants SET stock_quantity = $1 WHERE id = $2 RETURNING id, item_id, variant_name, stock_quantity',
    [stockQuantity, req.params.variantId]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Variant not found' });
  await logAction(req.user.id, 'menu_variant.inventory_updated', 'item_variant', req.params.variantId, { stockQuantity });
  res.json({ variant: rows[0] });
});

const listPendingReviews = asyncHandler(async (req, res) => {
  res.json({ reviews: await reviewsRepo.listPending() });
});

const moderateReview = asyncHandler(async (req, res) => {
  const { status } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) {
    throw new AppError('Review status must be approved or rejected', 400);
  }
  const review = await reviewsRepo.moderate(req.params.id, status, req.user.id);
  if (!review) return res.status(404).json({ error: 'Review not found' });
  await logAction(req.user.id, 'menu_review.moderated', 'menu_review', review.id, { status });
  res.json({ review });
});

// ---------- Order management ----------
const listOrders = asyncHandler(async (req, res) => {
  const { status, dateFrom, dateTo, search } = req.query;
  const orders = await ordersRepo.listForAdmin({ status, dateFrom, dateTo, search });
  res.json({ orders });
});

const getOrder = asyncHandler(async (req, res) => {
  const order = await ordersRepo.getOrderWithItems(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json({ order });
});

const VALID_TRANSITIONS = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'out_for_delivery', 'cancelled'],
  ready: ['completed', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['completed'],
  completed: [],
  cancelled: []
};

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { status, note } = req.body;
  const order = await ordersRepo.getOrderWithItems(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  const allowed = VALID_TRANSITIONS[order.status] || [];
  if (!allowed.includes(status)) {
    throw new AppError(`Cannot move an order from '${order.status}' to '${status}'`, 400);
  }
  const updated = await ordersRepo.updateStatus(req.params.id, status, req.user.id, note);
  await logAction(req.user.id, 'order.status_changed', 'order', req.params.id, { from: order.status, to: status });
  res.json({ order: updated });
});

// ---------- Reservation management ----------
const listReservations = asyncHandler(async (req, res) => {
  const { date, status } = req.query;
  const reservations = await reservationsRepo.listForAdmin({ date, status });
  res.json({ reservations });
});

const updateReservationStatus = asyncHandler(async (req, res) => {
  const { status, internalNotes } = req.body;
  const reservation = await reservationsRepo.updateStatus(req.params.id, status, internalNotes);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  await logAction(req.user.id, 'reservation.status_changed', 'reservation', req.params.id, { status });
  res.json({ reservation });
});

const rescheduleReservation = asyncHandler(async (req, res) => {
  const { bookingDate, bookingTime } = req.body;
  const reservation = await reservationsRepo.reschedule(req.params.id, bookingDate, bookingTime);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  res.json({ reservation });
});

// ---------- Settings ----------
const getSettings = asyncHandler(async (req, res) => {
  res.json({ settings: await settingsRepo.getSettings() });
});

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await settingsRepo.updateSettings(req.body);
  await logAction(req.user.id, 'settings.updated', 'restaurant_settings', 1, req.body);
  res.json({ settings });
});

module.exports = {
  overview, listMenuItems, createMenuItem, updateMenuItem, deleteMenuItem, setVariantAvailability,
  setVariantInventory, listPendingReviews, moderateReview,
  listOrders, getOrder, updateOrderStatus,
  listReservations, updateReservationStatus, rescheduleReservation,
  getSettings, updateSettings
};
