const { query } = require('../config/db');

async function findActiveByCode(code) {
  const { rows } = await query(
    `SELECT * FROM coupons
     WHERE code = $1 AND is_active = true
       AND (starts_at IS NULL OR starts_at <= now())
       AND (expires_at IS NULL OR expires_at >= now())`,
    [code.toUpperCase()]
  );
  return rows[0] || null;
}

async function incrementUsage(couponId, client) {
  const runner = client || require('../config/db');
  await (client ? client.query.bind(client) : runner.query)(
    'UPDATE coupons SET times_used = times_used + 1 WHERE id = $1',
    [couponId]
  );
}

module.exports = { findActiveByCode, incrementUsage };
