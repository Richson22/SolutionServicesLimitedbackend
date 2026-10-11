const mongoose = require('mongoose');

// One row per staff member per week, created when the admin marks that week as paid.
const weeklyPayoutSchema = new mongoose.Schema(
  {
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    staffName: { type: String, default: '' },
    weekStart: { type: String, required: true }, // Monday, 'YYYY-MM-DD'
    workTotal: { type: Number, default: 0 },     // reviewed work that week, saved at payment time
    amount: { type: Number, required: true },    // what was paid
    method: { type: String, enum: ['Cash', 'Transfer', 'POS'], default: 'Cash' },
    note: { type: String, default: '', trim: true },
    paidAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

weeklyPayoutSchema.index({ staff: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model('WeeklyPayout', weeklyPayoutSchema);