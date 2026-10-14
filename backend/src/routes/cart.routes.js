const express = require('express');
const ctrl = require('../controllers/cart.controller');

const router = express.Router();
router.post('/validate', ctrl.validateCart);

module.exports = router;
