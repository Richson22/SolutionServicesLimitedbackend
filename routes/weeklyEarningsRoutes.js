// Weekly "paid as you work" earnings, worked out from the work staff send in (StaffRecord).
//
// server.js (put these ABOVE app.use('/api/admin', ...) and above the general-manager router):
//   const weeklyEarnings = require('./routes/weeklyEarningsRoutes');
//   app.use('/api/admin/weekly-earnings', weeklyEarnings.admin);
//   app.use('/api/general-manager/weekly-earnings', weeklyEarnings.gm);
//   app.use('/api/staff/me/earnings', weeklyEarnings.staff);
const express = require('express');
const StaffRecord = require('../models/StaffRecord');
const WeeklyPayout = require('../models/WeeklyPayout');
const User = require('../models/User');
let StaffProfile = null;
try { StaffProfile = require('../models/StaffProfile'); } catch (e) { /* profiles feature not installed */ }
const { verifyToken, requireRole } = require('../middleware/auth');

// ---- PAY RATES: the share of reviewed work that goes to the STAFF member ----
// Only businesses listed here use "pay as you work". The rest goes to the business.
const RATES = {
  'TheStyleZone-2': 30,   // The Style Zone: staff keeps 30%, the business keeps 70%
};
// ---------------------------------------------------------------------------

const nigeriaToday = () => new Date(Date.now() + 3600000);

// Monday to Sunday week that contains `input` (YYYY-MM-DD). Defaults to this week.
function weekRange(input) {
  const base = input && /^\d{4}-\d{2}-\d{2}$/.test(input) ? new Date(`${input}T00:00:00Z`) : nigeriaToday();
  const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const start = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  return { start, end: d.toISOString().slice(0, 10) };
}

async function computeWeek(start, end, { staffId = null } = {}) {
  const filter = { recordDate: { $gte: start, $lte: end }, business: { $in: Object.keys(RATES) } };
  if (staffId) filter.staff = staffId;

  const records = await StaffRecord.find(filter).lean();
  const byStaff = new Map();
  records.forEach((r) => {
    const key = String(r.staff);
    if (!byStaff.has(key)) {
      byStaff.set(key, { staffId: key, name: r.staffName || 'Unknown', business: r.business, records: 0, reviewed: 0, pending: 0, rejected: 0, work: 0, pay: 0 });
    }
    const row = byStaff.get(key);
    const amount = Number(r.amount) || 0;
    row.records += 1;
    if (r.status === 'reviewed') {
      row.work += amount;
      row.pay += (amount * (RATES[r.business] || 0)) / 100;
      row.reviewed += 1;
    } else if (r.status === 'submitted') {
      row.pending += amount;
    } else {
      row.rejected += 1;
    }
  });

  const rows = Array.from(byStaff.values()).map((r) => {
    const pay = Math.round(r.pay);
    return { ...r, pay, shop: Math.round(r.work) - pay, rate: RATES[r.business] || 0 };
  });

  const [payouts, profiles] = await Promise.all([
    WeeklyPayout.find({ weekStart: start, staff: { $in: rows.map((r) => r.staffId) } }).lean(),
    StaffProfile ? StaffProfile.find({ user: { $in: rows.map((r) => r.staffId) } }).lean() : [],
  ]);
  const paidBy = new Map(payouts.map((p) => [String(p.staff), p]));
  const profBy = new Map(profiles.map((p) => [String(p.user), p]));

  rows.forEach((r) => {
    const p = paidBy.get(r.staffId);
    r.paid = !!p;
    r.paidAmount = p ? p.amount : 0;
    r.paidMethod = p ? p.method : '';
    r.paidAt = p ? p.paidAt : null;
    const prof = profBy.get(r.staffId);
    r.photoUrl = prof ? prof.photoUrl || '' : '';
    r.bankName = prof ? prof.bankName || '' : '';
    r.accountNumber = prof ? prof.accountNumber || '' : '';
  });

  rows.sort((a, b) => b.pay - a.pay);
  return rows;
}

const totals = (rows) => ({
  work: rows.reduce((s, r) => s + r.work, 0),
  pay: rows.reduce((s, r) => s + r.pay, 0),
  shop: rows.reduce((s, r) => s + r.shop, 0),
  pending: rows.reduce((s, r) => s + r.pending, 0),
  paid: rows.filter((r) => r.paid).reduce((s, r) => s + r.paidAmount, 0),
});

const stripBank = (r) => ({ ...r, bankName: undefined, accountNumber: undefined });

/* ---------------- admin: full access ---------------- */
const admin = express.Router();
const adminOnly = [verifyToken, requireRole('admin')];

admin.get('/', adminOnly, async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.week);
    const rows = await computeWeek(start, end);
    res.json({ weekStart: start, weekEnd: end, rates: RATES, rows, totals: totals(rows) });
  } catch (err) {
    console.error('weekly earnings error:', err);
    res.status(500).json({ message: 'Could not load weekly earnings' });
  }
});

admin.get('/:staffId/records', adminOnly, async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.week);
    const records = await StaffRecord.find({ staff: req.params.staffId, business: { $in: Object.keys(RATES) }, recordDate: { $gte: start, $lte: end } })
      .sort({ recordDate: -1, createdAt: -1 }).lean();
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: 'Could not load records' });
  }
});

admin.post('/:staffId/pay', adminOnly, async (req, res) => {
  try {
    const { start, end } = weekRange(req.body.week);
    const [row] = await computeWeek(start, end, { staffId: req.params.staffId });
    if (!row || row.pay <= 0) return res.status(400).json({ message: 'Nothing to pay for this week' });
    const method = ['Cash', 'Transfer', 'POS'].includes(req.body.method) ? req.body.method : 'Cash';
    const payout = await WeeklyPayout.findOneAndUpdate(
      { staff: req.params.staffId, weekStart: start },
      { $set: { staffName: row.name, workTotal: row.work, amount: row.pay, method, note: req.body.note || '', paidAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    res.json({ success: true, payout });
  } catch (err) {
    console.error('weekly pay error:', err);
    res.status(500).json({ message: 'Could not save payment' });
  }
});

admin.delete('/:staffId/pay', adminOnly, async (req, res) => {
  try {
    const { start } = weekRange(req.query.week);
    await WeeklyPayout.deleteOne({ staff: req.params.staffId, weekStart: start });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not undo payment' });
  }
});

/* ---------------- general manager: read-only ---------------- */
const gm = express.Router();
const gmOnly = [verifyToken, requireRole('general-manager', 'admin')];

gm.get('/', gmOnly, async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.week);
    const rows = (await computeWeek(start, end)).map(stripBank);
    res.json({ weekStart: start, weekEnd: end, rows, totals: totals(rows) });
  } catch (err) {
    console.error('gm weekly earnings error:', err);
    res.status(500).json({ message: 'Could not load weekly earnings' });
  }
});

gm.get('/:staffId/records', gmOnly, async (req, res) => {
  try {
    const { start, end } = weekRange(req.query.week);
    const records = await StaffRecord.find({
      staff: req.params.staffId, business: { $in: Object.keys(RATES) }, recordDate: { $gte: start, $lte: end },
    }).sort({ recordDate: -1, createdAt: -1 }).lean();
    res.json({ records });
  } catch (err) {
    res.status(500).json({ message: 'Could not load records' });
  }
});

/* ---------------- staff: their own earnings ---------------- */
const staff = express.Router();
const staffOnly = [verifyToken, requireRole('staff', 'manager', 'general-manager')];

staff.get('/', staffOnly, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('businessId');
    const businessId = me ? me.businessId : '';
    const rate = RATES[businessId] || 0;

    const thisWeek = weekRange();
    const weeks = [];
    for (let i = 0; i < 5; i += 1) {
      const d = new Date(`${thisWeek.start}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 7 * i);
      weeks.push(weekRange(d.toISOString().slice(0, 10)));
    }
    const results = await Promise.all(weeks.map((w) => computeWeek(w.start, w.end, { staffId: req.user.id })));
    const summary = weeks.map((w, i) => {
      const r = results[i][0];
      return {
        weekStart: w.start, weekEnd: w.end,
        work: r ? r.work : 0, pay: r ? r.pay : 0, pending: r ? r.pending : 0, records: r ? r.records : 0,
        paid: r ? r.paid : false, paidAmount: r ? r.paidAmount : 0, paidMethod: r ? r.paidMethod : '',
      };
    });

    // today's reviewed work and pending work
    const today = nigeriaToday().toISOString().slice(0, 10);
    const todays = await StaffRecord.find({ staff: req.user.id, recordDate: today, business: { $in: Object.keys(RATES) } }).lean();
    const todayWork = todays.filter((r) => r.status === 'reviewed').reduce((t, r) => t + (Number(r.amount) || 0), 0);
    const todayPending = todays.filter((r) => r.status === 'submitted').reduce((t, r) => t + (Number(r.amount) || 0), 0);

    res.json({
      applies: rate > 0,
      rate,
      week: summary[0],
      today: { work: todayWork, pay: Math.round((todayWork * rate) / 100), pending: todayPending },
      history: summary.slice(1),
    });
  } catch (err) {
    console.error('staff earnings error:', err);
    res.status(500).json({ message: 'Could not load earnings' });
  }
});

module.exports = { admin, gm, staff };