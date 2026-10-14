const express = require('express');
const settingsRepo = require('../repositories/settings.repo');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();
// Public read of the subset of settings the frontend needs (hours, phone, maps link, tax rate).
router.get('/', asyncHandler(async (req, res) => {
  const s = await settingsRepo.getSettings();
  res.json({
    settings: {
      restaurant_name: s.restaurant_name,
      phone: s.phone,
      address_line: s.address_line,
      google_maps_url: s.google_maps_url,
      google_rating: s.google_rating,
      google_review_count: s.google_review_count,
      opening_hours: s.opening_hours,
      tax_percent: s.tax_percent,
      pickup_enabled: s.pickup_enabled,
      cod_enabled: s.cod_enabled,
      razorpay_enabled: s.razorpay_enabled,
      maintenance_mode: s.maintenance_mode
    }
  });
}));

module.exports = router;
