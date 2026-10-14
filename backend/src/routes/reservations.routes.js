const express = require('express');
const ctrl = require('../controllers/reservations.controller');
const { reservation: reservationLimiter } = require('../middleware/rateLimiter');

const router = express.Router();
router.post('/', reservationLimiter, ctrl.create);
router.get('/:code', ctrl.getByCode);

module.exports = router;
