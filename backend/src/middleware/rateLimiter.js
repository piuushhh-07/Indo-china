const rateLimit = require('express-rate-limit');
const config = require('../config');

// Stricter limits on endpoints where abuse has real cost: brute-forcing logins,
// spamming the contact form, or flooding reservations/checkout.
function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message || 'Too many requests, please try again later.' }
  });
}

module.exports = {
  general: makeLimiter({ windowMs: config.rateLimit.windowMs, max: config.rateLimit.max }),
  login: makeLimiter({ windowMs: 15 * 60 * 1000, max: 10, message: 'Too many login attempts. Try again in a few minutes.' }),
  contact: makeLimiter({ windowMs: 60 * 60 * 1000, max: 5, message: 'Too many submissions. Please try again later.' }),
  reservation: makeLimiter({ windowMs: 60 * 60 * 1000, max: 10, message: 'Too many reservation attempts. Please try again later.' }),
  checkout: makeLimiter({ windowMs: 10 * 60 * 1000, max: 20, message: 'Too many checkout attempts. Please slow down.' })
};
