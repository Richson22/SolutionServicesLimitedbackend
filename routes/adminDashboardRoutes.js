// server/routes/adminDashboardRoutes.js
//
// Mount this in your main app: app.use('/api/admin', adminDashboardRoutes);
// (Note the base path already includes /admin, so routes below are
// defined as '/stats' and '/records' — not '/admin/stats'.)
//
// Protect both routes with your real admin auth middleware once you
// have it wired — see the commented-out line below.

const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Shoe = require('../models/Shoe');
const Record = require('../models/Record');
const ShoeRecord = require('../models/ShoeRecord');
const Attendance = require('../models/Attendance');
const Order = require('../models/Order');
const { verifyToken, requireRole } = require('../middleware/auth');

const adminOnly = [verifyToken, requireRole('admin')];
// const adminAuthMiddleware = require('../middleware/adminAuth'); // uncomment + adjust path

// GET /api/admin/attendance?role=student|staff|manager&status=on-time|late|absent&date=YYYY-MM-DD
router.get('/attendance', adminOnly, async (req, res) => {
  try {
    const { role, status, date } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (date) filter.date = date;

    const records = await Attendance.find(filter)
      .populate('user', 'name businessId')
      .sort({ checkInTime: -1 })
      .lean();

    const rows = records.map((r) => ({
      id: r._id,
      name: r.user?.name || 'Unknown',
      role: r.role,
      business: r.business,
      date: r.date,
      checkInTime: r.checkInTime,
      checkOutTime: r.checkOutTime,
      status: r.status,
    }));

    res.json({ records: rows });
  } catch (err) {
    console.error('Error loading attendance:', err);
    res.status(500).json({ message: 'Failed to load attendance' });
  }
});

// GET /api/admin/attendance/summary?date=YYYY-MM-DD
router.get('/attendance/summary', adminOnly, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const [onTime, late, absent, totalEligible] = await Promise.all([
      Attendance.countDocuments({ date, status: 'on-time' }),
      Attendance.countDocuments({ date, status: 'late' }),
      Attendance.countDocuments({ date, status: 'absent' }),
      User.countDocuments({ role: { $in: ['student', 'staff', 'manager', 'general-manager'] } }),
    ]);

    const marked = onTime + late + absent;
    const notMarked = Math.max(totalEligible - marked, 0);

    res.json({ onTime, late, absent, notMarked });
  } catch (err) {
    console.error('Error loading attendance summary:', err);
    res.status(500).json({ message: 'Failed to load summary' });
  }
});

// GET /api/admin/stats
router.get('/stats', adminOnly, async (req, res) => {
  try {
    const [totalUsers, totalStaff, pendingRecords, totalShoes] = await Promise.all([
      User.countDocuments({ role: { $in: ['student', 'customer'] } }),
      User.countDocuments({ role: 'staff' }),
      Record.countDocuments({ status: 'pending' }),
      Shoe.countDocuments(),
    ]);

    res.json({ totalUsers, totalStaff, pendingRecords, totalShoes });
  } catch (err) {
    console.error('Error loading admin stats:', err);
    res.status(500).json({ message: 'Failed to load stats' });
  }
});

// GET /api/admin/users?role=student|staff|manager&businessId=XpressSolution-1
router.get('/users', adminOnly, async (req, res) => {
  try {
    const { role, businessId } = req.query;
    const filter = {};
    if (role) filter.role = role;
    if (businessId) filter.businessId = businessId;

    const users = await User.find(filter)
      .select('name email role businessId suspended createdAt')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ users });
  } catch (err) {
    console.error('Error loading users:', err);
    res.status(500).json({ message: 'Failed to load users' });
  }
});

// PATCH /api/admin/users/:id/suspend   body: { suspended: true|false }
router.patch('/users/:id/suspend', adminOnly, async (req, res) => {
  try {
    const { suspended } = req.body;
    if (typeof suspended !== 'boolean') {
      return res.status(400).json({ success: false, message: '"suspended" must be true or false' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { suspended }, { new: true })
      .select('name email role businessId suspended createdAt');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Error updating suspension:', err);
    res.status(500).json({ success: false, message: 'Failed to update account' });
  }
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ success: false, message: 'Failed to delete account' });
  }
});

// GET /api/admin/records?limit=5&sort=recent
//   -> record-level summary (used by the Overview page's "Recent records" panel)
// GET /api/admin/records?businessId=TheStyleZone-2
//   -> flattened per-service rows (used by the Records page's Service/Staff/Price table)
router.get('/records', adminOnly, async (req, res) => {
  try {
    const { businessId } = req.query;

    if (businessId) {
      const records = await Record.find({ business: businessId })
        .sort({ createdAt: -1 })
        .populate('manager', 'name')
        .lean();

      const rows = [];
      records.forEach((rec) => {
        (rec.services || []).forEach((s, index) => {
          rows.push({
            id: `${rec._id}-${index}`,
            recordId: rec._id,
            service: s.service,
            staffName: s.barber,
            price: s.price,
            paymentMode: s.paymentMode || '—',
            status: rec.status,
            business: rec.business,
            manager: rec.manager,
            createdAt: rec.createdAt,
            recordDate: rec.recordDate,
            recordTime: rec.recordTime,
          });
        });
      });

      return res.json({ records: rows });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    const records = await Record.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('manager', 'name')
      .lean();

    res.json({ records });
  } catch (err) {
    console.error('Error loading records:', err);
    res.status(500).json({ message: 'Failed to load records' });
  }
});

// GET /api/admin/:businessId/shoe-records — all managers' shoe submissions for one business
// Used by the Records page's Solution Feet Hub tab (Type/Item/Manager/Amount/Status table).
router.get('/:businessId/shoe-records', adminOnly, async (req, res) => {
  try {
    const { businessId } = req.params;

    const records = await ShoeRecord.find({ business: businessId })
      .sort({ createdAt: -1 })
      .populate('manager', 'name')
      .lean();

    res.json({ records });
  } catch (err) {
    console.error('Error loading shoe records:', err);
    res.status(500).json({ message: 'Failed to load shoe records' });
  }
});

// GET /api/admin/shoe-records/:id — full detail for one shoe record (arrival/sale/attendance)
router.get('/shoe-records/:id', adminOnly, async (req, res) => {
  try {
    const record = await ShoeRecord.findById(req.params.id)
      .populate('manager', 'name email')
      .lean();

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error loading shoe record:', err);
    res.status(500).json({ success: false, message: 'Failed to load record' });
  }
});

// PATCH /api/admin/shoe-records/:id — edit shoeName/quantity/price/notes
router.patch('/shoe-records/:id', adminOnly, async (req, res) => {
  try {
    const { shoeName, quantity, price, notes } = req.body;

    const update = {};
    if (shoeName !== undefined) update.shoeName = shoeName;
    if (quantity !== undefined) update.quantity = quantity === '' ? null : Number(quantity);
    if (price !== undefined) update.price = price === '' ? null : Number(price);
    if (notes !== undefined) update.notes = notes;

    const record = await ShoeRecord.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('manager', 'name email');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error editing shoe record:', err);
    res.status(500).json({ success: false, message: 'Failed to save changes' });
  }
});

// PATCH /api/admin/shoe-records/:id/status — approve or reject
router.patch('/shoe-records/:id/status', adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'approved' or 'rejected'" });
    }

    const record = await ShoeRecord.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('manager', 'name email');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error updating shoe record status:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
});

// DELETE /api/admin/shoe-records/:id
router.delete('/shoe-records/:id', adminOnly, async (req, res) => {
  try {
    const record = await ShoeRecord.findByIdAndDelete(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting shoe record:', err);
    res.status(500).json({ success: false, message: 'Failed to delete record' });
  }
});

// GET /api/admin/records/:id — full record detail (services, expenses, totals) for the detail modal
router.get('/records/:id', adminOnly, async (req, res) => {
  try {
    const record = await Record.findById(req.params.id)
      .populate('manager', 'name email')
      .lean();

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error loading record:', err);
    res.status(500).json({ success: false, message: 'Failed to load record' });
  }
});

// PATCH /api/admin/records/:id — edit services/expenses/weeklyIncome on a pending record
router.patch('/records/:id', adminOnly, async (req, res) => {
  try {
    const { services, expenses, weeklyIncome } = req.body;

    if (!Array.isArray(services) || services.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one valid service entry is required.' });
    }

    const cleanExpenses = Array.isArray(expenses) ? expenses : [];
    const totalExpenses = cleanExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
    const income = Number(weeklyIncome) || 0;
    const netTotal = income - totalExpenses;

    const record = await Record.findByIdAndUpdate(
      req.params.id,
      {
        services,
        expenses: cleanExpenses,
        weeklyIncome: income,
        totalExpenses,
        netTotal,
      },
      { new: true }
    ).populate('manager', 'name email');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error editing record:', err);
    res.status(500).json({ success: false, message: 'Failed to save changes' });
  }
});

// PATCH /api/admin/records/:id/status — approve or reject a record
router.patch('/records/:id/status', adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'approved' or 'rejected'" });
    }

    const record = await Record.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    ).populate('manager', 'name email');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Record not found' });
    }

    res.json({ success: true, record });
  } catch (err) {
    console.error('Error updating record status:', err);
    res.status(500).json({ success: false, message: 'Failed to update record status' });
  }
});

// GET /api/admin/orders?limit=50
router.get('/orders', adminOnly, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const orders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'name email')
      .lean();

    res.json({ success: true, orders });
  } catch (err) {
    console.error('Error loading orders:', err);
    res.status(500).json({ success: false, message: 'Failed to load orders' });
  }
});

// GET /api/admin/orders/:id — full detail for the modal
router.get('/orders/:id', adminOnly, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id).populate('userId', 'name email').lean();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    res.json({ success: true, order });
  } catch (err) {
    console.error('Error loading order:', err);
    res.status(500).json({ success: false, message: 'Failed to load order' });
  }
});

// PATCH /api/admin/orders/:id/status
router.patch('/orders/:id/status', adminOnly, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['processing', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `status must be one of: ${allowed.join(', ')}` });
    }

    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('userId', 'name email');
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.json({ success: true, order });
  } catch (err) {
    console.error('Error updating order status:', err);
    res.status(500).json({ success: false, message: 'Failed to update order status' });
  }
});

module.exports = router;