const express = require('express');
const ctrl = require('../controllers/menu.controller');
const reviewsCtrl = require('../controllers/reviews.controller');

const router = express.Router();
router.get('/categories', ctrl.getCategories);
router.get('/items', ctrl.getItems);
router.get('/items/:id', ctrl.getItem);
router.get('/items/:id/reviews', reviewsCtrl.listForItem);

module.exports = router;
