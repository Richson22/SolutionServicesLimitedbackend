// server/controllers/adminController.js
//
// ASSUMPTIONS (adjust to match your real setup):
// - You have a Mongoose model called `User` with fields: name, email, password, role, businessId, mustChangePassword
// - `role` is one of: 'student', 'staff', 'manager', 'general-manager', 'admin'
// - This route sits behind admin-only auth middleware (req.user.role === 'admin')
//
// npm install bcryptjs

const bcrypt = require('bcryptjs');
const User = require('../models/User'); // adjust path to your real User model
const { sendWelcomeEmail } = require('../utils/sendEmail');

// Generates a random temp password like "Xk7-Qw2p"
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pass = '';
  for (let i = 0; i < 8; i++) {
    pass += chars[Math.floor(Math.random() * chars.length)];
  }
  return pass;
}

/**
 * POST /api/admin/register-user
 * Body: { name, email, role, businessId }
 * role must be 'student' or 'staff' for this flow.
 */
async function registerUser(req, res) {
  try {
    const { name, email, role, businessId } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ success: false, message: 'name, email, and role are required' });
    }

    if (!['student', 'staff', 'manager', 'general-manager'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be student, staff, manager, or general-manager' });
    }

    if ((role === 'manager' || role === 'general-manager') && !businessId) {
      return res.status(400).json({ success: false, message: 'businessId is required when registering a manager' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role,
      businessId, // which of the 3 businesses this person belongs to
      mustChangePassword: true, // optional: force password change on first login
    });

    await sendWelcomeEmail({
      to: email,
      name,
      role,
      tempPassword, // plain text — only ever sent here, never stored
    });

    return res.status(201).json({
      success: true,
      message: `${role} registered and email sent`,
      user: { id: user._id, name: user.name, email: user.email, role: user.role, businessId: user.businessId },
    });
  } catch (err) {
    console.error('registerUser error:', err);
    return res.status(500).json({ success: false, message: 'Failed to register user' });
  }
}

module.exports = { registerUser };