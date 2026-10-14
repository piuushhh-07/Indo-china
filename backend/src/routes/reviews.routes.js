const express = require('express');
const ctrl = require('../controllers/reviews.controller');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.get('/mine', requireAuth, ctrl.listMine);
router.post('/', requireAuth, ctrl.create);

module.exports = router;
