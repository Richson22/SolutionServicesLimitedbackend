// server/routes/payrollroutes.js   (all lower-case on purpose)
// Mounted at /api/admin/payroll. Admin only.

const express = require('express');
const Person = require('../models/Person');
const PayrollEntry = require('../models/PayrollEntry');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [verifyToken, requireRole('admin')];

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const METHODS = ['Cash', 'Transfer', 'POS'];

const todayString = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10); // Nigeria UTC+1

// GET /api/admin/payroll?month=YYYY-MM
router.get('/', adminOnly, async (req, res) => {
  try {
    if (!MONTH_RE.test(req.query.month || '')) return res.status(400).json({ message: 'Choose a month' });
    const entries = await PayrollEntry.find({ month: req.query.month }).sort({ personName: 1 }).lean();
    res.json({ entries });
  } catch (err) {
    console.error('Load payroll error:', err);
    res.status(500).json({ message: 'Could not load payroll' });
  }
});

// POST /api/admin/payroll/generate   body: { month }
// Adds a row for every active staff member that does not have one yet for that month.
router.post('/generate', adminOnly, async (req, res) => {
  try {
    const month = req.body.month;
    if (!MONTH_RE.test(month || '')) return res.status(400).json({ message: 'Choose a month' });

    const staff = await Person.find({ type: 'staff', active: true }).lean();
    if (staff.length === 0) {
      return res.status(400).json({ message: 'No active staff saved yet. Add staff names first.' });
    }
    const have = new Set((await PayrollEntry.find({ month }).select('person').lean()).map((e) => String(e.person)));

    let created = 0;
    for (const p of staff) {
      if (have.has(String(p._id))) continue;
      try {
        await PayrollEntry.create({
          person: p._id,
          personName: p.name,
          business: p.business || '',
          detail: p.detail || '',
          month,
          baseSalary: p.monthlySalary || 0,
        });
        created += 1;
      } catch (e) {
        if (e.code !== 11000) throw e; // 11000 = already exists, ignore
      }
    }
    const entries = await PayrollEntry.find({ month }).sort({ personName: 1 }).lean();
    res.json({ created, entries });
  } catch (err) {
    console.error('Generate payroll error:', err);
    res.status(500).json({ message: 'Could not prepare payroll' });
  }
});

// PATCH /api/admin/payroll/:id   body: any of baseSalary, allowances, deductions, note, method, status
router.patch('/:id', adminOnly, async (req, res) => {
  try {
    const entry = await PayrollEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'Not found' });

    for (const key of ['baseSalary', 'allowances', 'deductions']) {
      if (req.body[key] !== undefined) {
        const n = Number(req.body[key]);
        if (!Number.isFinite(n) || n < 0) return res.status(400).json({ message: `${key} must be 0 or more` });
        entry[key] = n;
      }
    }
    if (req.body.note !== undefined) entry.note = String(req.body.note).trim();
    if (req.body.method !== undefined && METHODS.includes(req.body.method)) entry.method = req.body.method;
    if (req.body.status === 'paid') {
      entry.status = 'paid';
      entry.paidOn = todayString();
    } else if (req.body.status === 'unpaid') {
      entry.status = 'unpaid';
      entry.paidOn = '';
    }

    await entry.save(); // net is recalculated here
    res.json({ entry: entry.toObject() });
  } catch (err) {
    console.error('Update payroll error:', err);
    res.status(500).json({ message: 'Could not update' });
  }
});

// DELETE /api/admin/payroll/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const gone = await PayrollEntry.findByIdAndDelete(req.params.id);
    if (!gone) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete payroll error:', err);
    res.status(500).json({ message: 'Could not delete' });
  }
});

module.exports = router;