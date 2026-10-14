// All monetary math happens in integer paise to avoid floating point rounding errors.
// Display conversion (paise -> rupee string) only happens at the edge (API responses).
function rupeesToPaise(rupees) {
  return Math.round(Number(rupees) * 100);
}

function paiseToRupees(paise) {
  return Math.round(paise) / 100;
}

function formatInr(paise) {
  return `₹${paiseToRupees(paise).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

module.exports = { rupeesToPaise, paiseToRupees, formatInr };
