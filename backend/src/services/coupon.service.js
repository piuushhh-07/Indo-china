const couponsRepo = require('../repositories/coupons.repo');
const { AppError } = require('../middleware/errorHandler');

// Computes the discount in paise for a given coupon against a known subtotal.
// Does NOT mark the coupon as used — that happens inside the order-creation
// transaction so a coupon is never consumed by a checkout that then fails.
async function validateCoupon(code, subtotalPaise) {
  if (!code) return { coupon: null, discountPaise: 0 };

  const coupon = await couponsRepo.findActiveByCode(code);
  if (!coupon) throw new AppError('This coupon code is invalid or has expired', 400);

  if (coupon.usage_limit !== null && coupon.times_used >= coupon.usage_limit) {
    throw new AppError('This coupon has reached its usage limit', 400);
  }
  if (subtotalPaise < coupon.min_cart_paise) {
    throw new AppError(`This coupon needs a minimum cart value of ₹${(coupon.min_cart_paise / 100).toFixed(0)}`, 400);
  }

  let discountPaise;
  if (coupon.discount_type === 'percentage') {
    discountPaise = Math.round((subtotalPaise * coupon.discount_value) / 100);
    if (coupon.max_discount_paise !== null) {
      discountPaise = Math.min(discountPaise, coupon.max_discount_paise);
    }
  } else {
    discountPaise = coupon.discount_value;
  }
  discountPaise = Math.min(discountPaise, subtotalPaise);

  return { coupon, discountPaise };
}

module.exports = { validateCoupon };
