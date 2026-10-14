const razorpayService = require('../services/razorpay.service');
const ordersRepo = require('../repositories/orders.repo');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Called by the frontend after Razorpay's checkout widget returns. Verifies the
// signature server-side before ever marking an order paid — the browser's word alone
// is never sufficient.
const verifyPayment = asyncHandler(async (req, res) => {
  const { orderNumber, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
  const order = await ordersRepo.findByOrderNumber(orderNumber);
  if (!order) throw new AppError('Order not found', 404);

  const valid = razorpayService.verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
  if (!valid) {
    await pool.query(
      "UPDATE payments SET status = 'failed', failure_reason = 'signature_mismatch', updated_at = now() WHERE order_id = $1",
      [order.id]
    );
    throw new AppError('Payment verification failed', 400);
  }

  await pool.query(
    `UPDATE payments SET status = 'paid', razorpay_order_id = $1, razorpay_payment_id = $2, razorpay_signature = $3, updated_at = now()
     WHERE order_id = $4`,
    [razorpayOrderId, razorpayPaymentId, razorpaySignature, order.id]
  );
  const updated = await ordersRepo.markPaymentStatus(order.id, 'paid');
  await ordersRepo.updateStatus(order.id, 'confirmed', null, 'Payment verified, order auto-confirmed');

  res.json({ ok: true, order: updated });
});

// Idempotent webhook: Razorpay may deliver the same event more than once, and the
// handler must produce the same end state either way rather than double-processing.
const webhook = asyncHandler(async (req, res) => {
  const signature = req.headers['x-razorpay-signature'];
  const valid = razorpayService.verifyWebhookSignature(req.rawBody, signature);
  if (!valid) {
    logger.warn('Rejected webhook with invalid signature');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  const event = req.body;
  if (event.event === 'payment.captured') {
    const paymentEntity = event.payload.payment.entity;
    const { rows } = await pool.query(
      "SELECT order_id FROM payments WHERE razorpay_order_id = $1 AND status <> 'paid'",
      [paymentEntity.order_id]
    );
    if (rows[0]) {
      await ordersRepo.markPaymentStatus(rows[0].order_id, 'paid');
      await pool.query("UPDATE payments SET status = 'paid', updated_at = now() WHERE order_id = $1", [rows[0].order_id]);
    }
  }
  // Always 200 once signature is valid, per Razorpay's webhook guidance, so it stops retrying.
  res.json({ ok: true });
});

module.exports = { verifyPayment, webhook };
