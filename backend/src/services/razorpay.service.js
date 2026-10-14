const crypto = require('crypto');
const config = require('../config');
const { AppError } = require('../middleware/errorHandler');

let razorpayClient = null;
function getClient() {
  if (!config.razorpay.enabled) return null;
  if (!razorpayClient) {
    // Lazy require so the package import never fails a boot where Razorpay isn't configured yet.
    const Razorpay = require('razorpay');
    razorpayClient = new Razorpay({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  }
  return razorpayClient;
}

// Creates a Razorpay order for server-verified amountPaise. Throws a clear error
// if Razorpay hasn't been configured yet, rather than silently faking success.
async function createRazorpayOrder(amountPaise, receiptId) {
  const client = getClient();
  if (!client) {
    throw new AppError(
      'Online payment is not configured yet. Please choose Cash on Delivery, or ask the restaurant to add Razorpay API keys.',
      503
    );
  }
  const order = await client.orders.create({
    amount: amountPaise,
    currency: 'INR',
    receipt: receiptId,
    payment_capture: 1
  });
  return order;
}

// Verifies the HMAC signature Razorpay returns after checkout, per their documented
// scheme: HMAC_SHA256(order_id + "|" + payment_id, key_secret) must equal signature.
function verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  if (!config.razorpay.keySecret) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(razorpaySignature || ''));
}

// Verifies a webhook body's signature against the separately-configured webhook secret,
// per Razorpay's webhook documentation.
function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signatureHeader || ''));
  } catch {
    return false;
  }
}

module.exports = { createRazorpayOrder, verifyPaymentSignature, verifyWebhookSignature, isEnabled: () => config.razorpay.enabled };
