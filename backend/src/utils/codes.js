// Human-friendly, sortable reference codes. Not globally unique by construction alone —
// callers retry on the rare unique-constraint collision (see orders.repo.js).
function randomDigits(n) {
  let s = '';
  for (let i = 0; i < n; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function dateStamp(d = new Date()) {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

function generateOrderNumber() {
  return `ICR-${dateStamp()}-${randomDigits(4)}`;
}

function generateReservationCode() {
  return `RSV-${dateStamp()}-${randomDigits(4)}`;
}

module.exports = { generateOrderNumber, generateReservationCode };
