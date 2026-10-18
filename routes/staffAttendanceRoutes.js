// Staff check-in / check-out. Saves to the same Attendance collection the admin page reads.
const express = require('express');
const router = express.Router();
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const { verifyToken, requireRole } = require('../middleware/auth');
const { requireBoundDevice } = require('../middleware/deviceLock');

// ---- Adjust these to your rules (Nigeria time) ----
const OPENS_AT = { h: 8, m: 0 };       // clock-in opens
const ON_TIME_UNTIL = { h: 8, m: 30 }; // up to and including 8:30 = on time
const CLOSES_AT = { h: 8, m: 35 };     // 8:31 to 8:35 = late. After 8:35 nobody can clock in (absent)
const DAYS_OFF = [];                   // days nobody is expected. 0 = Sunday ... 6 = Saturday. e.g. [0]
const TRACKED_ROLES = ['staff', 'manager', 'general-manager'];
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

const guard = [verifyToken, requireRole('staff', 'manager', 'general-manager'), requireBoundDevice];

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
    if (mins < OPENS_AT.h * 60 + OPENS_AT.m) {
      return res.status(403).json({ success: false, message: 'Clock-in opens at 8:00 AM' });
    }
    if (mins > CLOSES_AT.h * 60 + CLOSES_AT.m) {
      return res.status(403).json({ success: false, message: 'Clock-in closed at 8:35 AM. You are marked absent today.' });
    }

    const user = await User.findById(req.user.id).select('role businessId');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const status = mins <= ON_TIME_UNTIL.h * 60 + ON_TIME_UNTIL.m ? 'on-time' : 'late';
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


// Called every few minutes while the staff member is clocked in and the dashboard is open.
router.post('/ping', guard, async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ success: false, message: 'Location is required' });
    }
    const rec = await Attendance.findOne({ user: req.user.id, date: todayString() });
    if (!rec || !rec.checkInTime || rec.checkOutTime) {
      return res.json({ success: true, ignored: true });
    }
    const distance = Math.round(distanceMeters(lat, lng, SHOP.lat, SHOP.lng));
    const inRange = distance <= RADIUS_METERS;
    rec.lastLocation = { lat, lng, at: new Date(), distance, inRange };
    if (!inRange && !rec.leftShopAt) rec.leftShopAt = new Date();
    await rec.save();
    res.json({ success: true, inRange, distance });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not save location' });
  }
});

// ---------------------------------------------------------------------------
// Weekly summary for admin and general manager: how many times each person was
// on time, late or absent. GET .../summary?date=YYYY-MM-DD&business=<id>
// (date can be any day in the week you want, default = this week, Monday to Sunday)
// ---------------------------------------------------------------------------
const viewerGuard = [verifyToken, requireRole('admin', 'general-manager')];

function weekOf(anyDate) {
  const d = new Date(`${anyDate}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7;
  const monday = d.getTime() - mondayOffset * 86400000;
  return Array.from({ length: 7 }, (_, i) => new Date(monday + i * 86400000).toISOString().slice(0, 10));
}

// Should a missing check-in on this day count as absent?
function absenceCounts(date) {
  const today = todayString();
  if (date > today) return false;
  if (DAYS_OFF.includes(new Date(`${date}T00:00:00Z`).getUTCDay())) return false;
  if (date < today) return true;
  return minutesNow() > CLOSES_AT.h * 60 + CLOSES_AT.m; // today: only after clock-in has closed
}

router.get('/summary', viewerGuard, async (req, res) => {
  try {
    const picked = /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : todayString();
    const dates = weekOf(picked);
    const roles = req.user.role === 'admin' ? TRACKED_ROLES : ['staff', 'manager'];
    const userFilter = { role: { $in: roles }, suspended: { $ne: true } };
    if (req.query.business) userFilter.businessId = req.query.business;

    const users = await User.find(userFilter).select('name role businessId createdAt').lean();
    const records = await Attendance.find({ date: { $in: dates }, user: { $in: users.map((u) => u._id) } })
      .select('user date status').lean();

    const byUser = new Map();
    records.forEach((r) => byUser.set(`${r.user}|${r.date}`, r));

    const people = users.map((u) => {
      const createdDay = u.createdAt ? new Date(new Date(u.createdAt).getTime() + 3600000).toISOString().slice(0, 10) : '0000-00-00';
      let onTime = 0, late = 0, absent = 0;
      const days = dates.map((date) => {
        const rec = byUser.get(`${u._id}|${date}`);
        if (rec) {
          if (rec.status === 'late') { late += 1; return { date, status: 'late' }; }
          onTime += 1; return { date, status: 'on-time' };
        }
        if (date >= createdDay && absenceCounts(date)) { absent += 1; return { date, status: 'absent' }; }
        return { date, status: 'none' };
      });
      return { userId: u._id, name: u.name, role: u.role, business: u.businessId, onTime, late, absent, days };
    });

    people.sort((a, b) => (b.absent + b.late) - (a.absent + a.late) || String(a.name).localeCompare(String(b.name)));

    res.json({
      success: true,
      from: dates[0],
      to: dates[6],
      dates,
      people,
      totals: people.reduce((t, p) => ({ onTime: t.onTime + p.onTime, late: t.late + p.late, absent: t.absent + p.absent }), { onTime: 0, late: 0, absent: 0 }),
    });
  } catch (err) {
    console.error('attendance summary error:', err);
    res.status(500).json({ success: false, message: 'Could not load the weekly summary' });
  }
});

module.exports = router;