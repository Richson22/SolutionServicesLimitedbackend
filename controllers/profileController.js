// server/controllers/profileController.js
//
// ASSUMPTION: an auth middleware runs before these and sets req.user
// (decoded from the JWT), e.g. req.user = { id, role, businessId }
// If you don't have that middleware yet, tell me and I'll write it.

const User = require('../models/User');

// GET /api/user/profile
async function getProfile(req, res) {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      name: user.name,
      email: user.email,
      role: user.role,
      memberSince: user.createdAt,
    });
  } catch (err) {
    console.error('getProfile error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
}

// PUT /api/user/profile
// Body: { name, email }
async function updateProfileInfo(req, res) {
  try {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ success: false, message: 'Name and email are required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email },
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({
      success: true,
      name: user.name,
      email: user.email,
      role: user.role,
      memberSince: user.createdAt,
    });
  } catch (err) {
    console.error('updateProfileInfo error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update profile' });
  }
}

module.exports = { getProfile, updateProfileInfo };