const { test } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const pricingService = require('../src/services/pricing.service');
const { pool } = require('../src/config/db');

// Known-good variant from the seeded menu: "65 Dry" / Veg = ₹170
const KNOWN_VARIANT_SQL = `
  SELECT iv.id FROM item_variants iv
  JOIN menu_items mi ON mi.id = iv.item_id
  WHERE mi.name = '65 Dry' AND iv.variant_name = 'Veg' LIMIT 1
`;

test('priceCart computes subtotal, tax and total from the database, not the client', async () => {
  const { rows } = await pool.query(KNOWN_VARIANT_SQL);
  assert.ok(rows[0], 'fixture variant must exist — run npm run seed first');
  const variantId = rows[0].id;

  const result = await pricingService.priceCart(
    [{ variantId, quantity: 2 }],
    { fulfillmentType: 'takeaway' }
  );

  assert.equal(result.subtotalPaise, 34000, '2 x ₹170 = ₹340');
  assert.equal(result.taxPaise, 1700, '5% of ₹340 = ₹17');
  assert.equal(result.totalPaise, 35700);
});

test('priceCart rejects a quantity of zero or negative', async () => {
  const { rows } = await pool.query(KNOWN_VARIANT_SQL);
  const variantId = rows[0].id;
  await assert.rejects(
    () => pricingService.priceCart([{ variantId, quantity: 0 }], { fulfillmentType: 'takeaway' }),
    /Invalid quantity/
  );
  await assert.rejects(
    () => pricingService.priceCart([{ variantId, quantity: -3 }], { fulfillmentType: 'takeaway' }),
    /Invalid quantity/
  );
});

test('priceCart rejects a variant id that does not exist', async () => {
  await assert.rejects(
    () => pricingService.priceCart(
      [{ variantId: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
      { fulfillmentType: 'takeaway' }
    ),
    /no longer exists/
  );
});

test('priceCart rejects an empty cart', async () => {
  await assert.rejects(() => pricingService.priceCart([], {}), /empty/);
});

test.after(async () => { await pool.end(); });
