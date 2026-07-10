// server/routes/studentRoutes.js
//
// Mount this in your main app: app.use('/api/student', studentRoutes);
//
// ASSUMPTION: each business has one physical location for the geofence
// check-in. Coordinates below are placeholders — replace with the real
// lat/lng for each shop, and adjust cutoff hours if opening times differ.

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Attendance = require('../models/Attendance');
const { verifyToken, requireRole } = require('../middleware/auth');

const studentOnly = [verifyToken, requireRole('student')];

// ASSUMPTION: replace with each business's real coordinates.
const BUSINESS_LOCATIONS = {
  'XpressSolution-1': { lat: 6.5244, lng: 3.3792, classStartHour: 8, lateCutoffHour: 10, lateCutoffMinute: 30 },
  'TheStyleZone-2': { lat: 6.5244, lng: 3.3792, classStartHour: 8, lateCutoffHour: 10, lateCutoffMinute: 30 },
  'SolutionfeetHub-3': { lat: 6.5244, lng: 3.3792, classStartHour: 8, lateCutoffHour: 10, lateCutoffMinute: 30 },
};

const ALLOWED_RADIUS_METERS = 100;

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/student/me
router.get('/me', studentOnly, async (req, res) => {
  try {
    const student = await User.findById(req.user.id).select('name email businessId');
    if (!student) return res.status(404).json({ message: 'Student not found' });
    res.json(student);
  } catch (err) {
    console.error('Error loading student profile:', err);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

// GET /api/student/location — business-scoped, based on the student's own businessId
router.get('/location', studentOnly, async (req, res) => {
  try {
    const loc = BUSINESS_LOCATIONS[req.user.businessId];
    if (!loc) {
      return res.status(404).json({ message: 'No location configured for this business yet' });
    }
    res.json({ lat: loc.lat, lng: loc.lng });
  } catch (err) {
    console.error('Error loading business location:', err);
    res.status(500).json({ message: 'Failed to load location' });
  }
});

// GET /api/student/attendance/status — today's check-in state
router.get('/attendance/status', studentOnly, async (req, res) => {
  try {
    const record = await Attendance.findOne({ user: req.user.id, date: todayISO() });
    res.json({
      clockedIn: !!(record && record.checkInTime && !record.checkOutTime),
      clockInTime: record?.checkInTime || null,
    });
  } catch (err) {
    console.error('Error loading attendance status:', err);
    res.status(500).json({ message: 'Failed to load status' });
  }
});

// GET /api/student/attendance/history
router.get('/attendance/history', studentOnly, async (req, res) => {
  try {
    const records = await Attendance.find({ user: req.user.id })
      .sort({ date: -1 })
      .limit(30)
      .lean();

    res.json(
      records.map((r) => ({
        id: r._id,
        date: r.date,
        status: r.status,
        checkInTime: r.checkInTime,
      }))
    );
  } catch (err) {
    console.error('Error loading attendance history:', err);
    res.status(500).json({ message: 'Failed to load history' });
  }
});

// POST /api/student/attendance/check-in   body: { lat, lng }
router.post('/attendance/check-in', studentOnly, async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const businessId = req.user.businessId;
    const loc = BUSINESS_LOCATIONS[businessId];

    if (!loc) {
      return res.status(400).json({ success: false, message: 'No location configured for this business yet' });
    }

    const distance = haversineDistance(lat, lng, loc.lat, loc.lng);
    if (distance > ALLOWED_RADIUS_METERS) {
      return res.status(403).json({ success: false, message: 'You are not on school grounds yet' });
    }

    const now = new Date();
    const cutoff = new Date();
    cutoff.setHours(loc.lateCutoffHour, loc.lateCutoffMinute, 0, 0);
    if (now >= cutoff) {
      return res.status(403).json({ success: false, message: 'Check-in has closed for today' });
    }

    const classStart = new Date();
    classStart.setHours(loc.classStartHour, 0, 0, 0);
    const status = now > new Date(classStart.getTime() + 60 * 60 * 1000) ? 'late' : 'on-time';

    const date = todayISO();
    const record = await Attendance.findOneAndUpdate(
      { user: req.user.id, date },
      {
        user: req.user.id,
        role: 'student',
        business: businessId,
        date,
        checkInTime: now,
        checkInLocation: { lat, lng },
        status,
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, clockInTime: record.checkInTime });
  } catch (err) {
    console.error('Error checking in:', err);
    res.status(500).json({ success: false, message: 'Failed to check in' });
  }
});

// POST /api/student/attendance/check-out
router.post('/attendance/check-out', studentOnly, async (req, res) => {
  try {
    const record = await Attendance.findOneAndUpdate(
      { user: req.user.id, date: todayISO() },
      { checkOutTime: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({ success: false, message: 'No check-in found for today' });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error checking out:', err);
    res.status(500).json({ success: false, message: 'Failed to check out' });
  }
});

module.exports = router;