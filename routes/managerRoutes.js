// server/routes/managerRoutes.js
//
// Mount this in your main app: app.use('/api/manager', managerRoutes);
//
// Protect all of these with your real manager auth middleware once you
// have it wired — see the commented-out line below. At minimum it should
// verify req.user.role is 'manager' or 'general-manager' AND that
// req.user.businessId matches the :businessId in the URL, so a manager
// from one business can never read or write another business's data.

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Record = require('../models/Record');
const { verifyToken, requireRole, requireOwnBusiness } = require('../middleware/auth.js');

const managerOnly = [verifyToken, requireRole('manager', 'general-manager'), requireOwnBusiness];
const ShoeRecord = require('../models/ShoeRecord'); // arrival/sale/attendance for Solution Feet Hub

// GET /api/manager/me — works for any manager, no businessId needed
router.get('/me', [verifyToken, requireRole('manager', 'general-manager')], async (req, res) => {
  try {
    const manager = await User.findById(req.user.id).select('name email');
    if (!manager) return res.status(404).json({ message: 'Manager not found' });
    res.json({ name: manager.name, email: manager.email });
  } catch (err) {
    console.error('Error loading manager profile:', err);
    res.status(500).json({ message: 'Failed to load profile' });
  }
});

// GET /api/manager/:businessId/shoe-stats — Solution Feet Hub only
router.get('/:businessId/shoe-stats', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;
    const managerId = req.user.id;

    const [pendingArrivals, pendingSales, attendanceToday] = await Promise.all([
      ShoeRecord.countDocuments({ business: businessId, manager: managerId, type: 'arrival', status: 'pending' }),
      ShoeRecord.countDocuments({ business: businessId, manager: managerId, type: 'sale', status: 'pending' }),
      ShoeRecord.findOne({
        business: businessId,
        manager: managerId,
        type: 'attendance',
        createdAt: { $gte: new Date().setHours(0, 0, 0, 0) },
      }),
    ]);

    res.json({ pendingArrivals, pendingSales, attendanceAlert: attendanceToday ? 0 : 1 });
  } catch (err) {
    console.error('Error loading shoe stats:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// GET /api/manager/:businessId/shoe-submissions?limit=8&sort=recent
router.get('/:businessId/shoe-submissions', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 100);

    const submissions = await ShoeRecord.find({ business: businessId, manager: req.user.id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('manager', 'name')
      .lean();

    res.json({ submissions });
  } catch (err) {
    console.error('Error loading shoe submissions:', err);
    res.status(500).json({ message: 'Failed to load submissions' });
  }
});

// POST /api/manager/:businessId/shoe-records
// Body: { type: 'arrival'|'sale'|'attendance', ...fields }
router.post('/:businessId/shoe-records', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { type, ...fields } = req.body;

    if (!['arrival', 'sale', 'attendance'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid record type' });
    }

    const title =
      type === 'arrival' ? `New arrival: ${fields.shoeName || 'Unnamed item'}` :
      type === 'sale'    ? `Sale: ${fields.itemName || 'Unnamed item'}` :
      `Attendance — ${fields.date || new Date().toISOString().slice(0, 10)}`;

    const record = await ShoeRecord.create({
      type,
      business: businessId,
      manager: req.user.id,
      title,
      shoeName: fields.shoeName || fields.itemName || '',
      quantity: fields.quantity ? Number(fields.quantity) : null,
      price: fields.price ? Number(fields.price) : null,
      notes: fields.notes || fields.staffPresent || '',
      status: 'pending',
    });

    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error('Error creating shoe record:', err);
    res.status(500).json({ success: false, message: 'Failed to submit record' });
  }
});

// GET /api/manager/:businessId/stats
router.get('/:businessId/stats', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;

    const [totalStaff, pendingRecords] = await Promise.all([
      User.countDocuments({ businessId, role: 'staff' }),
      Record.countDocuments({ business: businessId, status: 'pending' }),
    ]);

    // ASSUMPTION: staffOnDuty / attendanceRate need your attendance system,
    // which isn't wired up yet — returning 0 for now so the UI doesn't break.
    // Once attendance logic is shared, replace these two with real queries.
    const staffOnDuty = 0;
    const attendanceRate = 0;

    res.json({ totalStaff, pendingRecords, staffOnDuty, attendanceRate });
  } catch (err) {
    console.error('Error loading manager stats:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// GET /api/manager/:businessId/records?limit=5&sort=recent
router.get('/:businessId/records', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const records = await Record.find({ business: businessId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ records });
  } catch (err) {
    console.error('Error loading manager records:', err);
    res.status(500).json({ message: 'Failed to load records' });
  }
});

// POST /api/manager/:businessId/records
// Body: { title, services: [{service, price, barber}], expenses: [{label, amount}],
//         weeklyIncome, totalExpenses, netTotal }
router.post('/:businessId/records', managerOnly, async (req, res) => {
  try {
    const { businessId } = req.params;
    const { title, services, expenses, weeklyIncome, totalExpenses, netTotal, recordDate, recordTime } = req.body;

    if (!title || !Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ success: false, message: 'title and at least one service entry are required' });
    }

    // ASSUMPTION: req.user is populated by your auth middleware (decoded JWT).
    // Swap this for however you currently read the logged-in user's id.
    const managerId = req.user?.id;
    if (!managerId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const record = await Record.create({
      title,
      business: businessId,
      manager: managerId,
      services,
      expenses: expenses || [],
      weeklyIncome: Number(weeklyIncome) || 0,
      totalExpenses: Number(totalExpenses) || 0,
      netTotal: Number(netTotal) || 0,
      recordDate: recordDate || '',
      recordTime: recordTime || '',
      status: 'pending',
    });

    res.status(201).json({ success: true, record });
  } catch (err) {
    console.error('Error creating record:', err);
    res.status(500).json({ success: false, message: 'Failed to send record' });
  }
});

module.exports = router;