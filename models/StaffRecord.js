// server/models/StaffRecord.js
// A piece of work a staff member sends to the admin (a haircut, a service, a job done...).
const mongoose = require('mongoose');

const staffRecordSchema = new mongoose.Schema(
  {
    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    staffName: { type: String, default: '' },       // saved at send time so it still shows if the user is renamed or removed
    business: { type: String, required: true },     // e.g. 'TheStyleZone-2'
    recordDate: { type: String, required: true },   // 'YYYY-MM-DD', the day the work was done
    clientName: { type: String, default: '', trim: true },
    service: { type: String, required: true, trim: true },
    amount: { type: Number, default: 0, min: 0 },
    paymentMode: { type: String, enum: ['Cash', 'Transfer', 'POS'], default: 'Cash' },
    note: { type: String, default: '', trim: true },
    imageUrl: { type: String, default: '' },
    status: { type: String, enum: ['submitted', 'reviewed', 'rejected'], default: 'submitted' },
    rejectReason: { type: String, default: '' },
    reviewedAt: { type: Date },
  },
  { timestamps: true }
);

staffRecordSchema.index({ business: 1, recordDate: -1 });
staffRecordSchema.index({ staff: 1, createdAt: -1 });

module.exports = mongoose.model('StaffRecord', staffRecordSchema);