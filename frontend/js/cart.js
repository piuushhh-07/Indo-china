// The cart is held in localStorage ONLY as a temporary convenience so it survives a
// page refresh before checkout. It is never treated as a source of truth for price —
// every total shown here is provisional until the server recomputes it in
// /api/cart/validate and, again, independently, at /api/orders/checkout.
const CART_KEY = 'ics_cart_v1';

function readCart() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function writeCart(lines) {
  localStorage.setItem(CART_KEY, JSON.stringify(lines));
  updateCartBadge();
}

function cartLineKey(variantId, addonIds) {
  return `${variantId}::${(addonIds || []).slice().sort().join(',')}`;
}

function addToCart({ variantId, itemName, variantName, unitPricePaise, addonIds = [], addonNames = [], quantity = 1, specialInstructions = '' }) {
  const lines = readCart();
  const key = cartLineKey(variantId, addonIds);
  const existing = lines.find((l) => cartLineKey(l.variantId, l.addonIds) === key);
  if (existing) {
    existing.quantity += quantity;
  } else {
    lines.push({ variantId, itemName, variantName, unitPricePaise, addonIds, addonNames, quantity, specialInstructions });
  }
  writeCart(lines);
  showToast(`Added ${itemName}${variantName ? ` (${variantName})` : ''} to cart`);
}

function updateQuantity(index, quantity) {
  const lines = readCart();
  if (!lines[index]) return;
  if (quantity <= 0) {
    lines.splice(index, 1);
  } else {
    lines[index].quantity = Math.min(quantity, 50);
  }
  writeCart(lines);
}

function removeLine(index) {
  const lines = readCart();
  lines.splice(index, 1);
  writeCart(lines);
}

function clearCart() { writeCart([]); }

function cartItemCount() {
  return readCart().reduce((sum, l) => sum + l.quantity, 0);
}

function cartClientSubtotal() {
  // Display-only estimate — the server is the source of truth at validate/checkout time.
  return readCart().reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
}

function updateCartBadge() {
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    const count = cartItemCount();
    el.textContent = count;
    el.style.display = count > 0 ? 'flex' : 'none';
  });
}

document.addEventListener('DOMContentLoaded', updateCartBadge);
