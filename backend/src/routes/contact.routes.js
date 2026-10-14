const express = require('express');
const { pool } = require('../config/db');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../middleware/errorHandler');
const { contact: contactLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// Minimal spam guard: a hidden honeypot field real users never fill in.
router.post('/', contactLimiter, asyncHandler(async (req, res) => {
  const { name, email, phone, message, website } = req.body;
  if (website) return res.json({ ok: true }); // honeypot tripped — pretend success, drop silently
  if (!name || !message || (!email && !phone)) {
    throw new AppError('Name, message, and at least one of email or phone are required', 400);
  }
  await pool.query(
    `INSERT INTO audit_logs (action, entity_type, details) VALUES ('contact.submitted', 'contact_message', $1)`,
    [JSON.stringify({ name, email, phone, message: message.slice(0, 2000) })]
  );
  res.json({ ok: true });
}));

module.exports = router;
