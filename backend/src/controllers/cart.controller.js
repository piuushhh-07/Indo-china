const pricingService = require('../services/pricing.service');
const couponService = require('../services/coupon.service');
const settingsRepo = require('../repositories/settings.repo');
const asyncHandler = require('../utils/asyncHandler');

// Stateless cart validation: client sends { variantId, quantity, addonIds }[] plus
// fulfillment info; server recomputes everything from the database and returns a
// priced breakdown the client can display — nothing here is trusted back at checkout.
const validateCart = asyncHandler(async (req, res) => {
  const { lines, fulfillmentType, deliveryPincode, couponCode } = req.body;

  let deliveryZone = null;
  if (fulfillmentType === 'delivery' && deliveryPincode) {
    const zones = await settingsRepo.listDeliveryZones();
    deliveryZone = zones.find((z) => z.pinccodes.includes(deliveryPincode)) || null;
    if (!deliveryZone && zones.length > 0) {
      return res.status(400).json({ error: 'Sorry, we do not currently deliver to this pincode.' });
    }
  }

  const draftPricing = await pricingService.priceCart(lines, { fulfillmentType, deliveryZone });
  let coupon = null;
  let discountPaise = 0;
  if (couponCode) {
    const result = await couponService.validateCoupon(couponCode, draftPricing.subtotalPaise);
    coupon = result.coupon;
    discountPaise = result.discountPaise;
  }
  const finalPricing = await pricingService.priceCart(lines, { fulfillmentType, deliveryZone, couponDiscountPaise: discountPaise });

  res.json({
    pricing: finalPricing,
    coupon: coupon ? { code: coupon.code, discountPaise } : null
  });
});

module.exports = { validateCart };
