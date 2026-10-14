const { Pool } = require('pg');
const config = require('./index');

if (!config.database.url) {
  // Fail loudly at boot rather than silently falling back to defaults that could
  // point at the wrong database in production.
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and configure it.');
}

const pool = new Pool({
  connectionString: config.database.url,
  ssl: config.database.ssl ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  // Catches errors on idle clients so one bad connection doesn't crash the process.
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error', err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
