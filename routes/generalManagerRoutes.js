const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/auth');
const { createEquipment, listEquipment } = require('../controllers/equipmentController');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Record = require('../models/Record');


const gmOnly = [verifyToken, requireRole('general-manager')];

// POST /api/general-manager/equipment
router.post('/equipment', gmOnly, createEquipment);

// GET /api/general-manager/equipment?business=XpressSolution-1
router.get('/equipment', gmOnly, listEquipment);

// PASTE this block into your existing generalManagerRoutes.js, directly ABOVE the line `module.exports = router;`
// (the three require lines it needs are given separately in the instructions)

// Same absent rule as the admin attendance page (Nigeria time)
const ABSENT_AFTER_HOUR = 8;
const ABSENT_AFTER_MINUTE = 30;
const nigeriaNow = () => new Date(Date.now() + 60 * 60 * 1000);
const dayString = (d) => d.toISOString().slice(0, 10);
function absenceApplies(date) {
  const now = nigeriaNow();
  const today = dayString(now);
  if (!date || date > today) return false;
  if (date < today) return true;
  return now.getUTCHours() * 60 + now.getUTCMinutes() > ABSENT_AFTER_HOUR * 60 + ABSENT_AFTER_MINUTE;
}

const TEAM_ROLES = ['staff', 'manager'];

// One row per active staff/manager with their attendance for `date`
async function teamRows(date, business) {
  const filter = { role: { $in: TEAM_ROLES }, suspended: { $ne: true } };
  if (business) filter.businessId = business;
  const [users, records] = await Promise.all([
    User.find(filter).select('name email role businessId createdAt').sort({ name: 1 }).lean(),
    Attendance.find({ date }).lean(),
  ]);
  const byUser = new Map(records.map((r) => [String(r.user), r]));
  const absent = absenceApplies(date);
  return users.map((u) => {
    const r = byUser.get(String(u._id));
    let status = 'not-marked';
    if (r) status = r.status;
    else if (absent) status = 'absent';
    return {
      id: u._id,
      name: u.name,
      email: u.email || '',
      role: u.role,
      business: u.businessId,
      status,
      checkInTime: r ? r.checkInTime : null,
      checkOutTime: r ? r.checkOutTime : null,
    };
  });
}

// GET /overview?date=YYYY-MM-DD
router.get('/overview', gmOnly, async (req, res) => {
  try {
    const date = req.query.date || dayString(nigeriaNow());
    const rows = await teamRows(date);
    const count = (s) => rows.filter((r) => r.status === s).length;
    const byBusiness = {};
    rows.forEach((r) => {
      const b = r.business || 'Unassigned';
      byBusiness[b] = byBusiness[b] || { staff: 0, managers: 0 };
      if (r.role === 'manager') byBusiness[b].managers += 1; else byBusiness[b].staff += 1;
    });
    res.json({
      date,
      totalStaff: rows.filter((r) => r.role === 'staff').length,
      totalManagers: rows.filter((r) => r.role === 'manager').length,
      attendance: { onTime: count('on-time'), late: count('late'), absent: count('absent'), notMarked: count('not-marked') },
      byBusiness,
    });
  } catch (err) {
    console.error('gm overview error:', err);
    res.status(500).json({ message: 'Failed to load overview' });
  }
});

// GET /team?date=&business=
router.get('/team', gmOnly, async (req, res) => {
  try {
    const date = req.query.date || dayString(nigeriaNow());
    res.json({ date, team: await teamRows(date, req.query.business) });
  } catch (err) {
    console.error('gm team error:', err);
    res.status(500).json({ message: 'Failed to load team' });
  }
});

// GET /records?business=TheStyleZone-2
router.get('/records', gmOnly, async (req, res) => {
  try {
    const { business } = req.query;
    if (!business) return res.status(400).json({ message: 'business is required' });

    // Shoe records (Solution Feet Hub) are not for the General Manager
    if (business === 'SolutionfeetHub-3') return res.status(403).json({ message: 'Not available' });

    const records = await Record.find({ business }).sort({ createdAt: -1 }).limit(200).populate('manager', 'name').lean();
    const rows = [];
    records.forEach((rec) => {
      (rec.services || []).forEach((s, i) => {
        rows.push({
          id: `${rec._id}-${i}`, date: rec.recordDate || rec.createdAt, staff: s.barber || '',
          service: s.service, amount: s.price, payment: s.paymentMode || '', manager: rec.manager ? rec.manager.name : '',
          status: rec.status,
        });
      });
    });
    res.json({ kind: 'service', rows });
  } catch (err) {
    console.error('gm records error:', err);
    res.status(500).json({ message: 'Failed to load records' });
  }
});

module.exports = router;