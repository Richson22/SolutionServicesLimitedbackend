// server/models/PayrollEntry.js
// One row per staff member per month.
const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema(
  {
    person: { type: mongoose.Schema.Types.ObjectId, ref: 'Person', required: true, index: true },
    personName: { type: String, default: '' },       // copied at creation so old payslips keep the name
    business: { type: String, default: '' },
    detail: { type: String, default: '' },           // job role at the time
    month: { type: String, required: true, index: true }, // 'YYYY-MM'
    baseSalary: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    net: { type: Number, default: 0 },
    status: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
    paidOn: { type: String, default: '' },           // YYYY-MM-DD
    method: { type: String, enum: ['Cash', 'Transfer', 'POS'], default: 'Cash' },
    note: { type: String, default: '', trim: true },
  },
  { timestamps: true }
);

payrollSchema.index({ person: 1, month: 1 }, { unique: true });

payrollSchema.pre('validate', function (next) {
  this.net = (this.baseSalary || 0) + (this.allowances || 0) - (this.deductions || 0);
  next();
});

module.exports = mongoose.models.PayrollEntry || mongoose.model('PayrollEntry', payrollSchema);