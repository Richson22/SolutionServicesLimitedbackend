const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');

const User = require('../models/User');

const changePwLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many attempts. Try again later.' },
});

// POST /api/auth/change-password   body: { email, currentPassword, newPassword }
router.post('/change-password', changePwLimiter, async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    const ok = user && (await bcrypt.compare(currentPassword, user.password));

    if (!ok) {
      return res.status(401).json({ success: false, message: 'Email or current password is incorrect' });
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ success: false, message: 'Failed to change password' });
  }
});

module.exports = router;