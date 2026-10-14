const { test } = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const reservationService = require('../src/services/reservation.service');
const { pool } = require('../src/config/db');

const FUTURE_DATE = '2027-03-15'; // far enough out to not collide with other tests/seeds

test('validateAndCreate rejects a past date', async () => {
  await assert.rejects(
    () => reservationService.validateAndCreate({
      name: 'Test', mobile: '9999999999', bookingDate: '2020-01-01', bookingTime: '19:00', guestCount: 2
    }),
    /past/
  );
});

test('validateAndCreate rejects a time outside opening hours', async () => {
  await assert.rejects(
    () => reservationService.validateAndCreate({
      name: 'Test', mobile: '9999999999', bookingDate: FUTURE_DATE, bookingTime: '03:00', guestCount: 2
    }),
    /only available between/
  );
});

test('validateAndCreate rejects an invalid mobile number', async () => {
  await assert.rejects(
    () => reservationService.validateAndCreate({
      name: 'Test', mobile: '123', bookingDate: FUTURE_DATE, bookingTime: '19:00', guestCount: 2
    }),
    /valid 10-digit mobile/
  );
});

test('validateAndCreate accepts a valid booking, then rejects one that would exceed capacity', async () => {
  // Clean slate for this fixture date/time so the test is idempotent across repeated runs
  // (otherwise reservations accumulate from the previous run and the capacity math below drifts).
  await pool.query("DELETE FROM reservations WHERE booking_date = $1 AND booking_time = $2", [FUTURE_DATE, '20:00']);

  const first = await reservationService.validateAndCreate({
    name: 'Party A', mobile: '9000000001', bookingDate: FUTURE_DATE, bookingTime: '20:00', guestCount: 25
  });
  assert.ok(first.reservation_code.startsWith('RSV-'));

  // Default seating_capacity is 40; 25 + 20 = 45 should be rejected.
  await assert.rejects(
    () => reservationService.validateAndCreate({
      name: 'Party B', mobile: '9000000002', bookingDate: FUTURE_DATE, bookingTime: '20:00', guestCount: 20
    }),
    /fully booked/
  );

  // But a smaller party in the remaining capacity (25 + 10 = 35 <= 40) should succeed.
  const third = await reservationService.validateAndCreate({
    name: 'Party C', mobile: '9000000003', bookingDate: FUTURE_DATE, bookingTime: '20:00', guestCount: 10
  });
  assert.ok(third.reservation_code.startsWith('RSV-'));
});

test.after(async () => { await pool.end(); });
