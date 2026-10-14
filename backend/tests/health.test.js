const { test } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://localhost/indochina-health-test';
}
const request = require('supertest');
const createApp = require('../src/app');
const { pool } = require('../src/config/db');

test('GET /api/health reports server responsiveness only', async () => {
  const response = await request(createApp()).get('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { status: 'ok' });
});

test.after(async () => { await pool.end(); });
