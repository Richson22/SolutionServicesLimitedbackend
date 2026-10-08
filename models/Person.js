// server/models/Person.js
// A student or staff member that the admin has recorded (a name list, not a login account).
const mongoose = require('mongoose');

const personSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['student', 'staff'], required: true, index: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, index: true },          // lower-case name, used to catch duplicates
    phone: { type: String, default: '', trim: true },
    business: { type: String, default: '' },         // e.g. 'TheStyleZone-2', '' = not assigned
    detail: { type: String, default: '', trim: true }, // student: class / course, staff: job role
    monthlySalary: { type: Number, default: 0, min: 0 }, // staff only
    startDate: { type: String, default: '' },        // YYYY-MM-DD
    note: { type: String, default: '', trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Person || mongoose.model('Person', personSchema);