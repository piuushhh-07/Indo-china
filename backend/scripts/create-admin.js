#!/usr/bin/env node
// Secure, one-time admin bootstrap. There is deliberately NO public registration
// endpoint for admin/staff roles anywhere in the API — this script is the only way
// to create the first admin, and it's meant to be run once from a trusted shell
// (your local machine or your host's deploy console), never exposed as a route.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');

async function main() {
  const name = process.env.ADMIN_SETUP_NAME || process.argv[2];
  const mobile = (process.env.ADMIN_SETUP_MOBILE || process.argv[3] || '').replace(/\D/g, '').slice(-10);
  const email = process.env.ADMIN_SETUP_EMAIL || process.argv[4] || null;
  const password = process.env.ADMIN_SETUP_PASSWORD || process.argv[5];

  if (!name || mobile.length !== 10 || !password || password.length < 8) {
    console.error('Usage: node scripts/create-admin.js "Full Name" 9876543210 email@example.com StrongPassword123');
    console.error('(or set ADMIN_SETUP_NAME / ADMIN_SETUP_MOBILE / ADMIN_SETUP_EMAIL / ADMIN_SETUP_PASSWORD in .env)');
    process.exit(1);
  }

  const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [mobile]);
  if (existing.rows[0]) {
    await pool.query("UPDATE users SET role = 'admin' WHERE mobile = $1", [mobile]);
    console.log(`Existing user with mobile ${mobile} promoted to admin.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO users (name, mobile, email, password_hash, role) VALUES ($1,$2,$3,$4,'admin')`,
      [name, mobile, email, passwordHash]
    );
    console.log(`Admin account created for ${name} (${mobile}).`);
  }
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
