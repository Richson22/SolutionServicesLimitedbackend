// server/models/Attendance.js
//
// One shared collection for every check-in/out across all 3 businesses,
// tagged by role so AdminAttendance.jsx can filter/query across everyone
// (students, staff, managers) with a single find().

const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    role: {
      type: String,
      enum: ['student', 'staff', 'manager', 'general-manager'],
      required: true,
    },
    business: { type: String, required: true }, // matches User.businessId

    date: { type: String, required: true }, // 'YYYY-MM-DD', one record per person per day
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },

    checkInLocation: {
      lat: { type: Number },
      lng: { type: Number },
    },

    status: {
      type: String,
      enum: ['on-time', 'late', 'absent'],
      default: 'absent',
    },
  },
  { timestamps: true }
);

// One attendance record per person per day per business
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);