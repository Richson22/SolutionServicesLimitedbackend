// server/routes/appointmentRoutes.js

const express = require('express');
const router = express.Router();

const {
  getAppointments,
  cancelAppointment,
  getBusinessAppointments,
  createAppointment,
  getMyPendingRequests,
  getMySchedule,
  acceptAppointment,
  declineAppointment,
} = require('../controllers/appointmentController');
const { verifyToken, requireRole } = require('../middleware/auth');

router.get('/', verifyToken, getAppointments);
router.post('/', verifyToken, createAppointment);
router.patch('/:id/cancel', verifyToken, cancelAppointment);

// Staff/manager view — sees every appointment for the Barbing Salon
router.get('/staff/all', verifyToken, requireRole('staff', 'manager', 'admin'), getBusinessAppointments);

// Staff dashboard — scoped to the logged-in staff member's own bookings only
router.get('/staff/requests', verifyToken, requireRole('staff', 'manager', 'admin'), getMyPendingRequests);
router.get('/staff/schedule', verifyToken, requireRole('staff', 'manager', 'admin'), getMySchedule);
router.patch('/:id/accept', verifyToken, requireRole('staff', 'manager', 'admin'), acceptAppointment);
router.patch('/:id/decline', verifyToken, requireRole('staff', 'manager', 'admin'), declineAppointment);

module.exports = router;