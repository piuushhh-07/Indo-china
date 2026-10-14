const { test } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { pool } = require('../src/config/db');
const usersRepo = require('../src/repositories/users.repo');

test('passwords are stored hashed, never in plain text', async () => {
  const mobile = '9123498765';
  await pool.query('DELETE FROM users WHERE mobile = $1', [mobile]); // clean slate if re-run
  const passwordHash = await bcrypt.hash('SuperSecret123', 12);
  const user = await usersRepo.create({ name: 'Hash Test', mobile, passwordHash });

  assert.notEqual(user.password_hash, 'SuperSecret123');
  assert.ok(user.password_hash.startsWith('$2'), 'bcrypt hashes start with $2a$/$2b$');
  assert.ok(await bcrypt.compare('SuperSecret123', user.password_hash));
  assert.ok(!(await bcrypt.compare('WrongPassword', user.password_hash)));
});

test('duplicate mobile numbers are rejected at the database level', async () => {
  const mobile = '9123498766';
  await pool.query('DELETE FROM users WHERE mobile = $1', [mobile]);
  const passwordHash = await bcrypt.hash('Password123', 12);
  await usersRepo.create({ name: 'First', mobile, passwordHash });
  await assert.rejects(() => usersRepo.create({ name: 'Second', mobile, passwordHash }));
});

test.after(async () => { await pool.end(); });
