const express = require('express');
const ctrl = require('../controllers/payments.controller');

const router = express.Router();
router.post('/verify', ctrl.verifyPayment);
// NOTE: webhook needs the raw body for signature verification — wired with
// express.raw() in app.js on this exact path, ahead of the json() parser.
router.post('/webhook', ctrl.webhook);

module.exports = router;
