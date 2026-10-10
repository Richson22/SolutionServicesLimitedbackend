// Mount in server.js (above app.use('/api/admin', ...)):
//   const staffProfileRoutes = require('./routes/staffProfileRoutes');
//   app.use('/api/staff/me/profile', staffProfileRoutes.staff);
//   app.use('/api/admin/staff-profiles', staffProfileRoutes.admin);
const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const StaffProfile = require('../models/StaffProfile');
const User = require('../models/User');
const { verifyToken, requireRole } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'staff-profile-photos',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 600, height: 600, crop: 'fill', gravity: 'face', quality: 'auto' }],
    public_id: (req) => `staff-${req.user.id}-${Date.now()}`,
  },
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

const FIELDS = [
  'fullName', 'phone', 'whatsapp', 'address', 'gender', 'stateOfOrigin',
  'guarantorName', 'guarantorPhone', 'guarantorAddress', 'bankName', 'accountNumber',
];

// A profile counts as complete once these are filled in
const isComplete = (p) =>
  !!(p && p.fullName && p.phone && p.address && p.photoUrl && p.guarantorName && p.guarantorPhone);

const shape = (p) => ({
  ...FIELDS.reduce((o, k) => ({ ...o, [k]: (p && p[k]) || '' }), {}),
  photoUrl: (p && p.photoUrl) || '',
  verified: !!(p && p.verified),
  complete: isComplete(p),
  updatedAt: p ? p.updatedAt : null,
});

/* ---------------- staff: their own profile ---------------- */
const staff = express.Router();
const staffOnly = [verifyToken, requireRole('staff', 'manager', 'general-manager')];

staff.get('/', staffOnly, async (req, res) => {
  try {
    const [user, profile] = await Promise.all([
      User.findById(req.user.id).select('name businessId role'),
      StaffProfile.findOne({ user: req.user.id }),
    ]);
    res.json({ name: user ? user.name : '', businessId: user ? user.businessId : '', ...shape(profile) });
  } catch (err) {
    res.status(500).json({ message: 'Could not load profile' });
  }
});

staff.put('/', staffOnly, (req, res) => {
  upload.single('photo')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? 'Photo is too large (max 8MB).' : `Photo upload failed: ${err.message || 'unsupported file'}`;
      return res.status(400).json({ message });
    }
    try {
      const update = {};
      FIELDS.forEach((k) => { if (typeof req.body[k] === 'string') update[k] = req.body[k].trim(); });
      if (update.accountNumber) update.accountNumber = update.accountNumber.replace(/\D/g, '');

      const existing = await StaffProfile.findOne({ user: req.user.id });
      if (req.file) {
        update.photoUrl = req.file.path;
        update.photoPublicId = req.file.filename || '';
        if (existing && existing.photoPublicId) {
          try { await cloudinary.uploader.destroy(existing.photoPublicId); } catch (e) { /* ignore */ }
        }
      }
      const profile = await StaffProfile.findOneAndUpdate(
        { user: req.user.id },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      res.json({ success: true, ...shape(profile) });
    } catch (e) {
      console.error('profile save error:', e);
      res.status(500).json({ message: 'Could not save profile' });
    }
  });
});

/* ---------------- admin: see everyone's details ---------------- */
const admin = express.Router();
const adminOnly = [verifyToken, requireRole('admin')];

admin.get('/', adminOnly, async (req, res) => {
  try {
    const users = await User.find({ role: 'staff' }).select('name businessId suspended').lean();
    const profiles = await StaffProfile.find({ user: { $in: users.map((u) => u._id) } }).lean();
    const byUser = new Map(profiles.map((p) => [String(p.user), p]));
    const rows = users.map((u) => {
      const p = byUser.get(String(u._id));
      return {
        userId: u._id,
        name: (p && p.fullName) || u.name,
        business: u.businessId,
        suspended: !!u.suspended,
        phone: (p && p.phone) || '',
        photoUrl: (p && p.photoUrl) || '',
        hasProfile: !!p,
        complete: isComplete(p),
        verified: !!(p && p.verified),
        updatedAt: p ? p.updatedAt : null,
      };
    });
    rows.sort((a, b) => a.name.localeCompare(b.name));
    res.json({ staff: rows });
  } catch (err) {
    res.status(500).json({ message: 'Could not load staff profiles' });
  }
});

admin.get('/:userId', adminOnly, async (req, res) => {
  try {
    const [user, profile] = await Promise.all([
      User.findById(req.params.userId).select('name businessId email'),
      StaffProfile.findOne({ user: req.params.userId }),
    ]);
    if (!user) return res.status(404).json({ message: 'Staff not found' });
    res.json({ userId: user._id, loginName: user.name, email: user.email || '', businessId: user.businessId, hasProfile: !!profile, ...shape(profile) });
  } catch (err) {
    res.status(500).json({ message: 'Could not load profile' });
  }
});

admin.patch('/:userId/verify', adminOnly, async (req, res) => {
  try {
    const verified = !!req.body.verified;
    const profile = await StaffProfile.findOneAndUpdate(
      { user: req.params.userId },
      { $set: { verified, verifiedAt: verified ? new Date() : null } },
      { new: true }
    );
    if (!profile) return res.status(404).json({ message: 'This staff member has not filled in a profile yet' });
    res.json({ success: true, verified: profile.verified });
  } catch (err) {
    res.status(500).json({ message: 'Could not update' });
  }
});

module.exports = { staff, admin };