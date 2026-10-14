const express = require('express');
const ctrl = require('../controllers/orders.controller');
const { requireAuth } = require('../middleware/auth');
const { checkout: checkoutLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.post('/checkout', checkoutLimiter, ctrl.checkout);
router.get('/mine', requireAuth, ctrl.myOrders);
router.get('/:orderNumber', ctrl.getByNumber);

module.exports = router;
