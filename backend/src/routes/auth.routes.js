const express = require('express');
const ctrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { login: loginLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.post('/register', loginLimiter, ctrl.register);
router.post('/login', loginLimiter, ctrl.login);
router.post('/logout', ctrl.logout);
router.get('/me', ctrl.me);
router.get('/addresses', requireAuth, ctrl.listAddresses);
router.post('/addresses', requireAuth, ctrl.addAddress);

module.exports = router;
