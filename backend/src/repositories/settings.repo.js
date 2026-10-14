const { query } = require('../config/db');

async function getSettings() {
  const { rows } = await query('SELECT * FROM restaurant_settings WHERE id = 1');
  return rows[0] || null;
}

async function updateSettings(patch) {
  const allowed = [
    'restaurant_name', 'phone', 'address_line', 'google_maps_url', 'google_rating', 'google_review_count',
    'opening_hours', 'tax_percent', 'default_delivery_fee_paise', 'default_min_order_paise',
    'pickup_enabled', 'cod_enabled', 'razorpay_enabled', 'reservation_seating_capacity',
    'reservation_slot_minutes', 'maintenance_mode'
  ];
  const fields = Object.keys(patch).filter((k) => allowed.includes(k));
  if (fields.length === 0) return getSettings();

  const setClauses = fields.map((f, i) => `${f} = $${i + 1}`);
  const values = fields.map((f) => patch[f]);
  const { rows } = await query(
    `UPDATE restaurant_settings SET ${setClauses.join(', ')}, updated_at = now() WHERE id = 1 RETURNING *`,
    values
  );
  return rows[0];
}

async function listDeliveryZones() {
  const { rows } = await query('SELECT * FROM delivery_zones WHERE is_active = true ORDER BY name');
  return rows;
}

module.exports = { getSettings, updateSettings, listDeliveryZones };
