const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const couponService = require('../src/services/coupon.service');
const { pool } = require('../src/config/db');

const testSuffix = require('crypto').randomBytes(6).toString('hex').toUpperCase();
const welcomeCode = `TESTWELCOME${testSuffix}`;
const expiredCode = `TESTEXPIRED${testSuffix}`;

before(async () => {
  await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, min_cart_paise, max_discount_paise)
     VALUES ($1, 'percentage', 10, 20000, 10000)`,
    [welcomeCode]
  );
  await pool.query(
    `INSERT INTO coupons (code, discount_type, discount_value, expires_at)
     VALUES ($1, 'fixed', 5000, now() - interval '1 day')`,
    [expiredCode]
  );
});

test('validateCoupon applies a percentage discount under its cap', async () => {
  const { coupon, discountPaise } = await couponService.validateCoupon(welcomeCode, 34000);
  assert.equal(coupon.code, welcomeCode);
  assert.equal(discountPaise, 3400); // 10% of 340 = 34, well under the 100-rupee cap
});

test('validateCoupon caps a percentage discount at max_discount_paise', async () => {
  // 10% of a ₹2000 cart would be ₹200, but the test coupon caps at ₹100.
  const { discountPaise } = await couponService.validateCoupon(welcomeCode, 200000);
  assert.equal(discountPaise, 10000);
});

test('validateCoupon rejects a cart below the minimum', async () => {
  await assert.rejects(() => couponService.validateCoupon(welcomeCode, 10000), /minimum cart value/);
});

test('validateCoupon rejects an expired coupon', async () => {
  await assert.rejects(() => couponService.validateCoupon(expiredCode, 100000), /invalid or has expired/);
});

test('validateCoupon rejects an unknown code', async () => {
  await assert.rejects(() => couponService.validateCoupon('DOESNOTEXIST', 100000), /invalid or has expired/);
});

test('validateCoupon with no code returns zero discount', async () => {
  const { coupon, discountPaise } = await couponService.validateCoupon(null, 50000);
  assert.equal(coupon, null);
  assert.equal(discountPaise, 0);
});

after(async () => {
  await pool.query('DELETE FROM coupons WHERE code = ANY($1::text[])', [[welcomeCode, expiredCode]]);
  await pool.end();
});
