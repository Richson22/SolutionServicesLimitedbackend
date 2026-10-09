// Staff check-in / check-out. Saves to the same Attendance collection the admin page reads.
const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { verifyToken, requireRole } = require('../middleware/auth');

// ---- Adjust these to your rules (Nigeria time) ----
const SHIFT_START = { h: 8, m: 0 };    // on time up to here
const CLOSES_AT = { h: 10, m: 30 };    // clock-in not allowed after this
const SHOP = { lat: 6.716498, lng: 8.779433 };
const RADIUS_METERS = 100;

const nigeriaNow = () => new Date(Date.now() + 60 * 60 * 1000);
const todayString = () => nigeriaNow().toISOString().slice(0, 10);
const minutesNow = () => { const n = nigeriaNow(); return n.getUTCHours() * 60 + n.getUTCMinutes(); };

function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const guard = [verifyToken, requireRole('staff', 'manager', 'general-manager')];

router.get('/status', guard, async (req, res) => {
  try {
    const rec = await Attendance.findOne({ user: req.user.id, date: todayString() });
    res.json({
      clockedIn: !!(rec && rec.checkInTime && !rec.checkOutTime),
      clockedOut: !!(rec && rec.checkOutTime),
      clockInTime: rec && rec.checkInTime ? rec.checkInTime : null,
      status: rec ? rec.status : null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load attendance' });
  }
});

router.post('/clock-in', guard, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ success: false, message: 'Location is required to clock in' });
    }
    if (distanceMeters(lat, lng, SHOP.lat, SHOP.lng) > RADIUS_METERS) {
      return res.status(403).json({ success: false, message: 'You are not close enough to the shop' });
    }

    const date = todayString();
    const existing = await Attendance.findOne({ user: req.user.id, date });
    if (existing && existing.checkInTime) {
      return res.json({ success: true, clockInTime: existing.checkInTime, already: true });
    }

    const mins = minutesNow();
    if (mins > CLOSES_AT.h * 60 + CLOSES_AT.m) {
      return res.status(403).json({ success: false, message: 'Clock-in closed. You are marked absent today.' });
    }

    const user = await User.findById(req.user.id).select('role businessId');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const status = mins > SHIFT_START.h * 60 + SHIFT_START.m ? 'late' : 'on-time';
    const rec = await Attendance.findOneAndUpdate(
      { user: req.user.id, date },
      { $setOnInsert: {
          user: req.user.id, role: user.role, business: user.businessId, date,
          checkInTime: new Date(), status, checkInLocation: { lat, lng },
      } },
      { upsert: true, new: true }
    );
    res.json({ success: true, clockInTime: rec.checkInTime, status: rec.status });
  } catch (err) {
    console.error('clock-in error:', err);
    res.status(500).json({ success: false, message: 'Could not clock in' });
  }
});

router.post('/clock-out', guard, async (req, res) => {
  try {
    const rec = await Attendance.findOne({ user: req.user.id, date: todayString() });
    if (!rec || !rec.checkInTime) {
      return res.status(400).json({ success: false, message: 'You have not clocked in today' });
    }
    if (!rec.checkOutTime) { rec.checkOutTime = new Date(); await rec.save(); }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not clock out' });
  }
});

module.exports = router;