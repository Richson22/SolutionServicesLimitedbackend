// server/controllers/authController.js
//
// ASSUMPTIONS:
// - Mongoose `User` model with: email, password (hashed), role, name, mustChangePassword
// - JWT_SECRET is set in your .env
//
// npm install jsonwebtoken bcryptjs

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

/**
 * POST /api/auth/student-staff-login
 * Body: { email, password }
 * Shared login for student, staff, manager, and general-manager accounts.
 * The frontend routes each role to its own dashboard based on `role` and
 * `businessId` in the response — admin still uses a separate login route.
 */
async function studentStaffLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

  const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (user.suspended) {
      return res.status(403).json({ success: false, message: 'This account has been suspended. Contact your admin.' });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

   return res.status(200).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        businessId: user.businessId,
        mustChangePassword: user.mustChangePassword || false,
      },
    });
  } catch (err) {
    console.error('studentStaffLogin error:', err);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
}

/**
 * POST /api/auth/signup
 * Body: { name, email, password }
 * Public self-signup for customers — separate from the admin-registered
 * student/staff flow. Always creates role: 'customer'.
 */
async function signup(req, res) {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'customer',
      mustChangePassword: false, // they set their own password, no need to force a change
    });

    const token = jwt.sign(
      { id: user._id, role: user.role, businessId: user.businessId },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.status(201).json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('signup error:', err);
    return res.status(500).json({ success: false, message: 'Signup failed' });
  }
}

module.exports = { studentStaffLogin, signup };