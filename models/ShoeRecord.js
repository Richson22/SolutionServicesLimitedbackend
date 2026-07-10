// server/models/ShoeRecord.js
//
// Represents a submission a Solution Feet Hub manager sends to admin:
// a new stock arrival, a sale, or an attendance check-in/out.
// One shared model with a `type` field, instead of three separate
// collections, so the admin dashboard can query/filter across all
// three with a single find().

const mongoose = require('mongoose');

const shoeRecordSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      enum: ['arrival', 'sale', 'attendance'],
    },

    business: { type: String, required: true }, // matches Shoe.businessId / User.businessId
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    // Short display title, e.g. "New arrival: Nike Air Max" or "Sale: Adidas Samba".
    // For attendance records this can just be the manager's name + date.
    title: { type: String, required: true, trim: true },

    // Optional link back to a listed product, if the arrival/sale is for
    // a shoe that's already (or will be) on the storefront.
    shoe: { type: mongoose.Schema.Types.ObjectId, ref: 'Shoe', default: null },

    // --- Arrival-specific fields ---
    shoeName: { type: String, default: '' }, // used when `shoe` isn't linked yet
    quantity: { type: Number, default: null },

    // --- Sale-specific fields ---
    price: { type: Number, default: null },

    // --- Attendance-specific fields ---
    checkInTime: { type: Date, default: null },
    checkOutTime: { type: Date, default: null },
    attendanceStatus: {
      type: String,
      enum: ['on-time', 'late', 'absent', null],
      default: null,
    },

    notes: { type: String, default: '' },

   // Review status — matches the approve/reject actions on the admin
    // Records page (same pattern as the barber-shop Record model).
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ShoeRecord', shoeRecordSchema);