const reservationService = require('../services/reservation.service');
const reservationsRepo = require('../repositories/reservations.repo');
const asyncHandler = require('../utils/asyncHandler');

const create = asyncHandler(async (req, res) => {
  const reservation = await reservationService.validateAndCreate({
    ...req.body,
    userId: req.user ? req.user.id : null
  });
  res.status(201).json({ reservation });
});

const getByCode = asyncHandler(async (req, res) => {
  const reservation = await reservationsRepo.findByCode(req.params.code);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found' });
  res.json({ reservation });
});

module.exports = { create, getByCode };
