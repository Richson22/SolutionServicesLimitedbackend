// server/routes/accountRoutes.js
//
// Mount this in your main app: app.use('/api/account', accountRoutes);
//
// Generic self-service account routes — any authenticated user (customer,
// student, staff, manager, admin) can update their own name/email or
// change their own password. Not role-restricted, since everyone should
// be able to manage their own account.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');

const User = require('../models/User');
const { verifyToken } = require('../middleware/auth');

// PATCH /api/account/me   body: { name, email }
router.patch('/me', verifyToken, async (req, res) => {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    // If the email is changing, make sure it's not already taken by someone else
    if (email) {
      const existing = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existing) {
        return res.status(409).json({ success: false, message: 'That email is already in use' });
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email },
      { new: true }
    ).select('name email role businessId');

    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    res.json({ success: true, user });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
});

// PATCH /api/account/me/password   body: { currentPassword, newPassword }
router.patch('/me/password', verifyToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'New password must be at least 6 characters' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Account not found' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
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