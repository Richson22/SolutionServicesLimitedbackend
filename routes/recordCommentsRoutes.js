// routes/recordCommentsRoutes.js
// Mounted at /api/record-comments
//   POST /:id        body { text }  -> add a comment (staff on own record, admin, general manager)
//   POST /:id/seen                  -> mark the thread as read by whoever is calling

const express = require('express');
const User = require('../models/User');
const StaffRecord = require('../models/StaffRecord');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();
const anyOf = [verifyToken, requireRole('staff', 'admin', 'general-manager')];

function roleKey(role) {
  if (role === 'admin') return 'admin';
  if (role === 'general-manager') return 'gm';
  return 'staff';
}

router.post('/:id', anyOf, async (req, res) => {
  try {
    const text = String(req.body.text || '').trim().slice(0, 1000);
    if (!text) return res.status(400).json({ message: 'Please write a comment' });

    const record = await StaffRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });

    const me = await User.findById(req.user.id).select('name role');
    const role = roleKey(req.user.role || me?.role);

    if (role === 'staff' && String(record.staff) !== String(req.user.id)) {
      return res.status(403).json({ message: 'You can only comment on your own records' });
    }

    record.comments.push({
      authorId: req.user.id,
      authorName: me?.name || '',
      role,
      text,
    });
    if (role === 'staff') record.leadUnread = true;
    else record.staffUnread = true;

    await record.save();
    res.json({ record: record.toObject() });
  } catch (err) {
    console.error('Add record comment error:', err);
    res.status(500).json({ message: 'Could not save the comment' });
  }
});

router.post('/:id/seen', anyOf, async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select('role');
    const role = roleKey(req.user.role || me?.role);
    const record = await StaffRecord.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Record not found' });
    if (role === 'staff') {
      if (String(record.staff) !== String(req.user.id)) return res.status(403).json({ message: 'Not your record' });
      record.staffUnread = false;
    } else {
      record.leadUnread = false;
    }
    await record.save();
    res.json({ record: record.toObject() });
  } catch (err) {
    console.error('Mark record comments seen error:', err);
    res.status(500).json({ message: 'Could not update' });
  }
});

module.exports = router;