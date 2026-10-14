#!/usr/bin/env node
// Minimal migration runner: applies each .sql file in migrations/ once, in order,
// tracked in a schema_migrations table. No external migration framework needed.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../src/config');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

async function main() {
  const client = new Client({
    connectionString: config.database.url,
    ssl: config.database.ssl ? { rejectUnauthorized: false } : false
  });
  await client.connect();

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const applied = new Set(
    (await client.query('SELECT filename FROM schema_migrations')).rows.map((r) => r.filename)
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let ranAny = false;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    process.stdout.write(`Applying ${file} ... `);
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log('ok');
      ranAny = true;
    } catch (err) {
      console.log('FAILED');
      console.error(err.message);
      process.exitCode = 1;
      break;
    }
  }
  if (!ranAny && process.exitCode !== 1) {
    console.log('No new migrations to apply.');
  }
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
