const menuRepo = require('../repositories/menu.repo');
const settingsRepo = require('../repositories/settings.repo');
const { AppError } = require('../middleware/errorHandler');

// Re-derives the entire order total from the database, ignoring any price/total the
// client sent. This is the single place "never trust the browser's total" is enforced.
//
// cartLines: [{ variantId, quantity, addonIds: [], specialInstructions }]
async function priceCart(cartLines, { fulfillmentType, deliveryZone, couponDiscountPaise = 0 } = {}) {
  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    throw new AppError('Cart is empty', 400);
  }

  const settings = await settingsRepo.getSettings();
  const lines = [];
  let subtotalPaise = 0;

  for (const line of cartLines) {
    const quantity = parseInt(line.quantity, 10);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
      throw new AppError('Invalid quantity for an item in your cart', 400);
    }

    const variant = await menuRepo.getVariant(line.variantId);
    if (!variant) throw new AppError('One of the items in your cart no longer exists', 400, { variantId: line.variantId });
    if (!variant.is_available || !variant.item_is_available) {
      throw new AppError(`${variant.item_name} is currently unavailable`, 400);
    }
    if (variant.stock_quantity !== null && variant.stock_quantity < quantity) {
      throw new AppError(`${variant.item_name} does not have enough stock`, 409, {
        availableQuantity: variant.stock_quantity
      });
    }

    const addonIds = Array.isArray(line.addonIds) ? line.addonIds : [];
    const addons = await menuRepo.getAddonsByIds(addonIds);
    if (addons.length !== addonIds.length) {
      throw new AppError('One of the selected add-ons is no longer available', 400);
    }

    const addonsTotal = addons.reduce((sum, a) => sum + a.price_paise, 0);
    const unitPrice = variant.price_paise + addonsTotal;
    const lineTotal = unitPrice * quantity;

    subtotalPaise += lineTotal;
    lines.push({
      variantId: variant.id,
      menuItemId: variant.item_id,
      itemName: variant.item_name,
      variantName: variant.variant_name,
      unitPricePaise: unitPrice,
      quantity,
      addons: addons.map((a) => ({ name: a.name, price_paise: a.price_paise })),
      specialInstructions: (line.specialInstructions || '').slice(0, 300),
      lineTotalPaise: lineTotal
    });
  }

  let deliveryFeePaise = 0;
  if (fulfillmentType === 'delivery') {
    deliveryFeePaise = deliveryZone ? deliveryZone.delivery_fee_paise : settings.default_delivery_fee_paise;
    const minOrder = deliveryZone ? deliveryZone.min_order_paise : settings.default_min_order_paise;
    if (subtotalPaise < minOrder) {
      throw new AppError(`Minimum order for delivery is ₹${(minOrder / 100).toFixed(0)}`, 400);
    }
  }

  const discountPaise = Math.min(couponDiscountPaise, subtotalPaise);
  const taxableAmount = subtotalPaise - discountPaise;
  const taxPaise = Math.round((taxableAmount * Number(settings.tax_percent)) / 100);
  const totalPaise = taxableAmount + taxPaise + deliveryFeePaise;

  return {
    lines,
    subtotalPaise,
    discountPaise,
    deliveryFeePaise,
    taxPaise,
    taxPercent: Number(settings.tax_percent),
    totalPaise
  };
}

module.exports = { priceCart };
