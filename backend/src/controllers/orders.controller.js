const pricingService = require('../services/pricing.service');
const couponService = require('../services/coupon.service');
const settingsRepo = require('../repositories/settings.repo');
const ordersRepo = require('../repositories/orders.repo');
const razorpayService = require('../services/razorpay.service');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorHandler');

const checkout = asyncHandler(async (req, res) => {
  const { lines, fulfillmentType, address, couponCode, paymentMethod, idempotencyKey, guest } = req.body;

  if (!['delivery', 'takeaway', 'pickup'].includes(fulfillmentType)) {
    throw new AppError('Invalid fulfillment type', 400);
  }
  if (!['cod', 'razorpay'].includes(paymentMethod)) {
    throw new AppError('Invalid payment method', 400);
  }

  const settings = await settingsRepo.getSettings();
  if (settings.maintenance_mode) {
    throw new AppError('Online ordering is temporarily paused. Please call the restaurant directly.', 503);
  }
  if (paymentMethod === 'cod' && !settings.cod_enabled) {
    throw new AppError('Cash on Delivery is not available right now. Please pay online.', 400);
  }
  if (paymentMethod === 'razorpay' && !settings.razorpay_enabled) {
    throw new AppError('Online payment is not available right now. Please choose Cash on Delivery.', 400);
  }

  let deliveryZone = null;
  if (fulfillmentType === 'delivery') {
    if (!address || !address.line1 || !address.mobile) {
      throw new AppError('A delivery address and mobile number are required', 400);
    }
    const zones = await settingsRepo.listDeliveryZones();
    deliveryZone = zones.find((z) => address.pincode && z.pinccodes.includes(address.pincode)) || null;
  }

  const draft = await pricingService.priceCart(lines, { fulfillmentType, deliveryZone });
  let coupon = null;
  let discountPaise = 0;
  if (couponCode) {
    const result = await couponService.validateCoupon(couponCode, draft.subtotalPaise);
    coupon = result.coupon;
    discountPaise = result.discountPaise;
  }
  const pricing = await pricingService.priceCart(lines, { fulfillmentType, deliveryZone, couponDiscountPaise: discountPaise });

  const customer = req.user
    ? { userId: req.user.id }
    : { guestName: guest && guest.name, guestMobile: guest && guest.mobile, guestEmail: guest && guest.email };

  if (!req.user && (!guest || !guest.name || !guest.mobile)) {
    throw new AppError('Name and mobile number are required for guest checkout', 400);
  }

  const order = await ordersRepo.createOrder({
    customer,
    fulfillment: {
      type: fulfillmentType,
      address: address && address.line1,
      landmark: address && address.landmark,
      locality: address && address.locality,
      instructions: address && address.instructions
    },
    pricing,
    paymentMethod,
    couponId: coupon ? coupon.id : null,
    idempotencyKey
  });

  let razorpayOrder = null;
  if (paymentMethod === 'razorpay') {
    razorpayOrder = await razorpayService.createRazorpayOrder(pricing.totalPaise, order.order_number);
  }

  res.status(201).json({ order, razorpayOrder, razorpayKeyId: paymentMethod === 'razorpay' ? require('../config').razorpay.keyId : undefined });
});

const getByNumber = asyncHandler(async (req, res) => {
  const order = await ordersRepo.findByOrderNumber(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  // Guest lookup requires the mobile number as a shared secret so one guest can't browse another's order.
  if (!req.user && req.query.mobile && order.guest_mobile && req.query.mobile.slice(-10) !== order.guest_mobile.slice(-10)) {
    return res.status(404).json({ error: 'Order not found' });
  }
  res.json({ order });
});

const myOrders = asyncHandler(async (req, res) => {
  const orders = await ordersRepo.listForCustomer(req.user.id);
  res.json({ orders });
});

module.exports = { checkout, getByNumber, myOrders };
