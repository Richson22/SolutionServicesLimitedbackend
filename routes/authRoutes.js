// server/routes/authRoutes.js

const express = require('express');
const router = express.Router();

const { registerUser } = require('../controllers/adminController');
const { studentStaffLogin } = require('../controllers/authController');
const { getProfile, updateProfileInfo } = require('../controllers/profileController');
const { verifyToken } = require('../middleware/auth');
const { deviceLock, resetDevice } = require('../middleware/deviceLock');
const requireAdmin = require('../middleware/requireAdmin'); // adjust if this exports differently

// Admin registers a student or staff member — protected by verifyToken + requireAdmin
router.post('/admin/register-user', verifyToken, requireAdmin, registerUser);

// Dedicated login for students and staff only
router.post('/auth/student-staff-login', deviceLock, studentStaffLogin);
router.post('/auth/reset-device/:userId', verifyToken, requireAdmin, resetDevice);

// Logged-in user's own profile — protected by verifyToken
router.get('/user/profile', verifyToken, getProfile);
router.put('/user/profile', verifyToken, updateProfileInfo);

module.exports = router;