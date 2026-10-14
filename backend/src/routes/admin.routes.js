const express = require('express');
const ctrl = require('../controllers/admin.controller');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
// Every route below requires an authenticated admin or staff session — there is
// no public admin registration endpoint anywhere in this API.
router.use(requireAuth, requireRole('admin', 'staff'));

router.get('/overview', ctrl.overview);

router.get('/menu/items', ctrl.listMenuItems);
router.post('/menu/items', requireRole('admin'), ctrl.createMenuItem);
router.patch('/menu/items/:id', ctrl.updateMenuItem);
router.delete('/menu/items/:id', requireRole('admin'), ctrl.deleteMenuItem);
router.patch('/menu/variants/:variantId/availability', ctrl.setVariantAvailability);
router.patch('/menu/variants/:variantId/inventory', ctrl.setVariantInventory);

router.get('/reviews', requireRole('admin'), ctrl.listPendingReviews);
router.patch('/reviews/:id/status', requireRole('admin'), ctrl.moderateReview);

router.get('/orders', ctrl.listOrders);
router.get('/orders/:id', ctrl.getOrder);
router.patch('/orders/:id/status', ctrl.updateOrderStatus);

router.get('/reservations', ctrl.listReservations);
router.patch('/reservations/:id/status', ctrl.updateReservationStatus);
router.patch('/reservations/:id/reschedule', ctrl.rescheduleReservation);

router.get('/settings', ctrl.getSettings);
router.patch('/settings', requireRole('admin'), ctrl.updateSettings);

module.exports = router;
