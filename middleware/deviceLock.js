const User = require('../models/User');

// Roles that are tied to one phone. Admin / general-manager / customers stay free.
const LOCKED_ROLES = ['staff', 'cashier', 'manager'];

// Use on the login route. Lets the normal login run, then checks the device before the token is released.
function deviceLock(req, res, next) {
  const originalJson = res.json.bind(res);
  res.json = function (body) {
    if (!(body && body.success && body.token)) return originalJson(body);
    (async () => {
      try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const deviceId = String(req.body.deviceId || '').trim();
        const user = await User.findOne({ email });
        if (!user || !LOCKED_ROLES.includes(user.role)) return originalJson(body);

        if (!deviceId) {
          return res.status(400), originalJson({ success: false, message: 'Device could not be identified. Refresh the page and try again.' });
        }
        if (!user.deviceId) {
          const taken = await User.findOne({ deviceId, _id: { $ne: user._id } });
          if (taken) {
            res.status(403);
            return originalJson({ success: false, message: 'This phone is already registered to another staff account. Ask admin to reset it.' });
          }
          user.deviceId = deviceId;
          user.deviceBoundAt = new Date();
          await user.save();
          return originalJson(body);
        }
        if (user.deviceId !== deviceId) {
          res.status(403);
          return originalJson({ success: false, message: 'This account is registered to another phone. Ask admin to reset it.' });
        }
        return originalJson(body);
      } catch (e) {
        console.error('deviceLock error', e);
        res.status(500);
        return originalJson({ success: false, message: 'Could not verify device. Try again.' });
      }
    })();
    return res;
  };
  next();
}

// Use after verifyToken on clock-in / clock-out / ping.
async function requireBoundDevice(req, res, next) {
  try {
    const user = await User.findById(req.user.id).select('role deviceId');
    if (!user || !LOCKED_ROLES.includes(user.role)) return next();
    const sent = String(req.headers['x-device-id'] || '');
    if (!user.deviceId || user.deviceId !== sent) {
      return res.status(403).json({
        success: false,
        message: 'Attendance can only be marked from your registered phone. Log out and log in again on it, or ask admin to reset your device.',
      });
    }
    next();
  } catch (e) {
    console.error('requireBoundDevice error', e);
    res.status(500).json({ success: false, message: 'Could not verify device.' });
  }
}

// Admin only: free a staff member's device so they can register a new phone.
async function resetDevice(req, res) {
  try {
    const user = await User.findByIdAndUpdate(req.params.userId, { deviceId: null, deviceBoundAt: null }, { new: true });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'Device reset. They can log in on a new phone now.' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'Could not reset device' });
  }
}

module.exports = { deviceLock, requireBoundDevice, resetDevice };