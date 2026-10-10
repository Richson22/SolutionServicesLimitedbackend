const mongoose = require('mongoose');

const staffProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    whatsapp: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    gender: { type: String, default: '', trim: true },
    stateOfOrigin: { type: String, default: '', trim: true },
    guarantorName: { type: String, default: '', trim: true },
    guarantorPhone: { type: String, default: '', trim: true },
    guarantorAddress: { type: String, default: '', trim: true },
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    photoUrl: { type: String, default: '' },
    photoPublicId: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    verifiedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('StaffProfile', staffProfileSchema);