const { pool } = require('../config/db');
const { generateReservationCode } = require('../utils/codes');

async function sumGuestsForSlot(bookingDate, bookingTime, excludeStatuses = ['cancelled', 'rejected']) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(guest_count), 0) AS total
     FROM reservations
     WHERE booking_date = $1 AND booking_time = $2 AND status NOT IN (${excludeStatuses.map((_, i) => `$${i + 3}`).join(',')})`,
    [bookingDate, bookingTime, ...excludeStatuses]
  );
  return parseInt(rows[0].total, 10);
}

async function create({ userId, name, mobile, email, bookingDate, bookingTime, guestCount, occasion, specialRequests }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateReservationCode();
    try {
      const { rows } = await pool.query(
        `INSERT INTO reservations (
           reservation_code, user_id, name, mobile, email, booking_date, booking_time,
           guest_count, occasion, special_requests
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
        [code, userId || null, name, mobile, email || null, bookingDate, bookingTime, guestCount, occasion || null, specialRequests || null]
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505' && err.constraint === 'reservations_reservation_code_key') continue;
      throw err;
    }
  }
  throw new Error('Could not generate a unique reservation code after 3 attempts');
}

async function findByCode(code) {
  const { rows } = await pool.query('SELECT * FROM reservations WHERE reservation_code = $1', [code]);
  return rows[0] || null;
}

async function listForAdmin({ date, status, limit = 100 } = {}) {
  const clauses = [];
  const params = [];
  if (date) { params.push(date); clauses.push(`booking_date = $${params.length}`); }
  if (status) { params.push(status); clauses.push(`status = $${params.length}`); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM reservations ${where} ORDER BY booking_date, booking_time LIMIT $${params.length}`,
    params
  );
  return rows;
}

async function updateStatus(id, status, internalNotes) {
  const { rows } = await pool.query(
    `UPDATE reservations SET status = $1,
       internal_notes = COALESCE($2, internal_notes), updated_at = now()
     WHERE id = $3 RETURNING *`,
    [status, internalNotes || null, id]
  );
  return rows[0] || null;
}

async function reschedule(id, bookingDate, bookingTime) {
  const { rows } = await pool.query(
    `UPDATE reservations SET booking_date = $1, booking_time = $2, status = 'pending', updated_at = now()
     WHERE id = $3 RETURNING *`,
    [bookingDate, bookingTime, id]
  );
  return rows[0] || null;
}

module.exports = { sumGuestsForSlot, create, findByCode, listForAdmin, updateStatus, reschedule };
