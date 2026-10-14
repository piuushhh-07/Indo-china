#!/usr/bin/env node
require('dotenv').config();
const { pool } = require('../src/config/db');

async function main() {
  try {
    const { rows } = await pool.query(`
      SELECT current_database() AS database_name, current_user AS database_user,
             current_setting('server_version') AS server_version,
             to_regclass('public.schema_migrations') IS NOT NULL AS migrations_exist
    `);
    const db = rows[0];
    console.log(`Connected to PostgreSQL ${db.server_version} as ${db.database_user} on "${db.database_name}".`);
    if (!db.migrations_exist) {
      console.error('The database schema is not initialized. Run "npm run migrate".');
      process.exitCode = 1;
      return;
    }
    console.log('Migration tracking table exists. Run "npm run migrate" to apply pending migrations.');
  } catch (error) {
    console.error(`PostgreSQL connection failed: ${error.message}`);
    console.error('Check that PostgreSQL is running and DATABASE_URL matches the host, port, and database.');
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
