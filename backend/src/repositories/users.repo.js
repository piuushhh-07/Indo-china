const { query } = require('../config/db');

async function findByMobile(mobile) {
  const { rows } = await query('SELECT * FROM users WHERE mobile = $1', [mobile]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function create({ name, mobile, email, passwordHash, role = 'customer' }) {
  const { rows } = await query(
    `INSERT INTO users (name, mobile, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [name, mobile, email || null, passwordHash, role]
  );
  return rows[0];
}

async function listAddresses(userId) {
  const { rows } = await query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC', [userId]);
  return rows;
}

async function addAddress(userId, addr) {
  const { rows } = await query(
    `INSERT INTO addresses (user_id, label, line1, landmark, locality, city, pincode, is_default)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [userId, addr.label || 'Home', addr.line1, addr.landmark || null, addr.locality || null, addr.city || 'Ambernath', addr.pincode || null, Boolean(addr.isDefault)]
  );
  return rows[0];
}

module.exports = { findByMobile, findById, create, listAddresses, addAddress };
