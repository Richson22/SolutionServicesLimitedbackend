// server/routes/staffRecordRoutes.js
//
// Two routers in one file:
//   staff -> mounted at /api/staff-records        (a staff member sends and lists their own records)
//   admin -> mounted at /api/admin/staff-records  (the admin receives, reviews or rejects them)

const express = require('express');
const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');

const cloudinary = require('../config/cloudinary');
const User = require('../models/User');
const StaffRecord = require('../models/StaffRecord');
const { verifyToken, requireRole } = require('../middleware/auth');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_MODES = ['Cash', 'Transfer', 'POS'];

function todayString() {
  // Nigeria is UTC+1 all year
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Photo upload (optional photo, up to 5MB)                           */
/* ------------------------------------------------------------------ */
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'staff-records',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 1400, height: 1400, crop: 'limit' }],
    public_id: (req) => `staff-record-${req.user.id}-${Date.now()}`,
  },
});
const uploader = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// If the photo fails, the record is still saved without it (and the staff member is told).
function handleUpload(req, res, next) {
  uploader.single('image')(req, res, (err) => {
    if (err) {
      console.error('Staff record image upload error:', err);
      req.uploadWarning =
        err.code === 'LIMIT_FILE_SIZE'
          ? 'The photo was too large (max 5MB), so the record was sent without it.'
          : 'The photo could not be uploaded, so the record was sent without it.';
    }
    next();
  });
}

/* ------------------------------------------------------------------ */
/* Staff router                                                       */
/* ------------------------------------------------------------------ */
const staff = express.Router();
const staffOnly = [verifyToken, requireRole('staff')];

// POST /api/staff-records
staff.post('/', staffOnly, handleUpload, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('name businessId');
    if (!me) return res.status(404).json({ success: false, message: 'Staff account not found' });
    if (!me.businessId) {
      return res.status(400).json({ success: false, message: 'Your account has no business assigned' });
    }

    const service = String(req.body.service || '').trim();
    if (!service) {
      return res.status(400).json({ success: false, message: 'Please say what service or work was done' });
    }

    const amount = Number(req.body.amount || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ success: false, message: 'Amount must be a number, 0 or more' });
    }

    const paymentMode = PAYMENT_MODES.includes(req.body.paymentMode) ? req.body.paymentMode : 'Cash';
    const recordDate = DATE_RE.test(req.body.recordDate || '') ? req.body.recordDate : todayString();

    const record = await StaffRecord.create({
      staff: me._id,
      staffName: me.name || '',
      business: me.businessId,            // always taken from the account, never from the form
      recordDate,
      clientName: String(req.body.clientName || '').trim(),
      service,
      amount,
      paymentMode,
      note: String(req.body.note || '').trim(),
      imageUrl: req.file ? req.file.path : '',
    });

    res.status(201).json({ success: true, record, warning: req.uploadWarning || '' });
  } catch (err) {
    console.error('Send staff record error:', err);
    res.status(500).json({ success: false, message: 'Could not send the record' });
  }
});

// GET /api/staff-records/mine
staff.get('/mine', staffOnly, async (req, res) => {
  try {
    const records = await StaffRecord.find({ staff: req.user.id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ records });
  } catch (err) {
    console.error('Load own staff records error:', err);
    res.status(500).json({ message: 'Could not load your records' });
  }
});

/* ------------------------------------------------------------------ */
/* Admin router                                                       */
/* ------------------------------------------------------------------ */
const admin = express.Router();
const adminOnly = [verifyToken, requireRole('admin')];

// GET /api/admin/staff-records?business=&status=&from=YYYY-MM-DD&to=YYYY-MM-DD
admin.get('/', adminOnly, async (req, res) => {
  try {
    const filter = {};
    if (req.query.business) filter.business = String(req.query.business);
    if (['submitted', 'reviewed', 'rejected'].includes(req.query.status)) filter.status = req.query.status;

    const range = {};
    if (DATE_RE.test(req.query.from || '')) range.$gte = req.query.from;
    if (DATE_RE.test(req.query.to || '')) range.$lte = req.query.to;
    if (Object.keys(range).length) filter.recordDate = range;

    const records = await StaffRecord.find(filter)
      .sort({ recordDate: -1, createdAt: -1 })
      .limit(500)
      .lean();
    res.json({ records });
  } catch (err) {
    console.error('Admin load staff records error:', err);
    res.status(500).json({ message: 'Could not load staff records' });
  }
});

// PATCH /api/admin/staff-records/:id   body: { status: 'reviewed' | 'rejected' | 'submitted', rejectReason? }
admin.patch('/:id', adminOnly, async (req, res) => {
  try {
    const { status, rejectReason } = req.body;
    if (!['submitted', 'reviewed', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    const update = {
      status,
      rejectReason: status === 'rejected' ? String(rejectReason || '').trim() : '',
      reviewedAt: status === 'submitted' ? undefined : new Date(),
    };
    const record = await StaffRecord.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!record) return res.status(404).json({ message: 'Record not found' });
    res.json({ record });
  } catch (err) {
    console.error('Admin update staff record error:', err);
    res.status(500).json({ message: 'Could not update the record' });
  }
});

module.exports = { staff, admin };