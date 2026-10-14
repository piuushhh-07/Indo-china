const { test, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const reviewsController = require('../src/controllers/reviews.controller');
const { pool } = require('../src/config/db');

function invoke(handler, body) {
  return new Promise((resolve) => {
    handler(
      { body, user: { id: '00000000-0000-4000-8000-000000000001' } },
      { status() { return this; }, json() { resolve(null); } },
      (error) => resolve(error)
    );
  });
}

test('review submission rejects invalid order and menu-item ids', async () => {
  const error = await invoke(reviewsController.create, {
    orderId: 'not-a-uuid',
    menuItemId: 'also-invalid',
    rating: 5,
    reviewText: 'Very good'
  });
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /valid order and menu item/);
});

test('review submission rejects ratings outside the 1–5 range', async () => {
  const error = await invoke(reviewsController.create, {
    orderId: '00000000-0000-4000-8000-000000000002',
    menuItemId: '00000000-0000-4000-8000-000000000003',
    rating: 6,
    reviewText: 'Very good'
  });
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /Rating must be/);
});

test('review submission rejects too-short review text', async () => {
  const error = await invoke(reviewsController.create, {
    orderId: '00000000-0000-4000-8000-000000000002',
    menuItemId: '00000000-0000-4000-8000-000000000003',
    rating: 5,
    reviewText: 'ok'
  });
  assert.equal(error.statusCode, 400);
  assert.match(error.message, /Review must be/);
});

after(async () => { await pool.end(); });
