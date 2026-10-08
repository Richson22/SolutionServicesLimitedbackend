// server/routes/peopleroutes.js   (all lower-case on purpose, Render is case-sensitive)
// Mounted at /api/admin/people. Admin only.

const express = require('express');
const Person = require('../models/Person');
const PayrollEntry = require('../models/PayrollEntry');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const adminOnly = [verifyToken, requireRole('admin')];

const TYPES = ['student', 'staff'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const keyOf = (name) => String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();

// Turns a request body into clean fields. Only fields that were sent are returned.
function pick(body) {
  const out = {};
  if (body.type !== undefined) out.type = body.type;
  if (body.name !== undefined) {
    out.name = String(body.name).trim().replace(/\s+/g, ' ');
    out.nameKey = keyOf(out.name);
  }
  if (body.phone !== undefined) out.phone = String(body.phone).trim();
  if (body.business !== undefined) out.business = String(body.business).trim();
  if (body.detail !== undefined) out.detail = String(body.detail).trim();
  if (body.note !== undefined) out.note = String(body.note).trim();
  if (body.startDate !== undefined) out.startDate = DATE_RE.test(body.startDate) ? body.startDate : '';
  if (body.monthlySalary !== undefined) out.monthlySalary = Number(body.monthlySalary || 0);
  if (body.active !== undefined) out.active = !!body.active;
  return out;
}

function problem(f, isCreate) {
  if (isCreate && !TYPES.includes(f.type)) return 'Choose student or staff';
  if (f.type !== undefined && !TYPES.includes(f.type)) return 'Type must be student or staff';
  if ((isCreate || f.name !== undefined) && (!f.name || f.name.length < 2)) return 'Please enter the full name';
  if (f.monthlySalary !== undefined && (!Number.isFinite(f.monthlySalary) || f.monthlySalary < 0)) {
    return 'Salary must be a number, 0 or more';
  }
  return '';
}

// GET /api/admin/people
router.get('/', adminOnly, async (req, res) => {
  try {
    const people = await Person.find({}).sort({ name: 1 }).limit(2000).lean();
    res.json({ people });
  } catch (err) {
    console.error('List people error:', err);
    res.status(500).json({ message: 'Could not load the list' });
  }
});

// POST /api/admin/people
router.post('/', adminOnly, async (req, res) => {
  try {
    const f = pick(req.body);
    const bad = problem(f, true);
    if (bad) return res.status(400).json({ message: bad });
    if (f.type !== 'staff') f.monthlySalary = 0;

    const dup = await Person.findOne({ type: f.type, nameKey: f.nameKey, business: f.business || '' }).lean();
    if (dup) return res.status(409).json({ message: `${f.name} is already saved as a ${f.type}` });

    const person = await Person.create(f);
    res.status(201).json({ person });
  } catch (err) {
    console.error('Create person error:', err);
    res.status(500).json({ message: 'Could not save this name' });
  }
});

// PATCH /api/admin/people/:id
router.patch('/:id', adminOnly, async (req, res) => {
  try {
    const f = pick(req.body);
    delete f.type; // a student cannot be turned into staff by accident, delete and re-add instead
    const bad = problem(f, false);
    if (bad) return res.status(400).json({ message: bad });

    const person = await Person.findByIdAndUpdate(req.params.id, f, { new: true }).lean();
    if (!person) return res.status(404).json({ message: 'Not found' });
    res.json({ person });
  } catch (err) {
    console.error('Update person error:', err);
    res.status(500).json({ message: 'Could not update' });
  }
});

// DELETE /api/admin/people/:id
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const used = await PayrollEntry.exists({ person: req.params.id });
    if (used) {
      return res.status(400).json({ message: 'This person has payroll history. Mark them inactive instead of deleting.' });
    }
    const gone = await Person.findByIdAndDelete(req.params.id);
    if (!gone) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete person error:', err);
    res.status(500).json({ message: 'Could not delete' });
  }
});

module.exports = router;