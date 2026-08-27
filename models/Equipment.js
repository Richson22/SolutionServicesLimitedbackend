// server/models/Equipment.js
//
// Logged by a general manager, scoped to whichever business the equipment
// belongs to. One shared collection across all 3 shops so admin can see
// everything in one query, same pattern as ShoeRecord/Record.

const mongoose = require('mongoose');

const equipmentSchema = new mongoose.Schema(
  {
    business: { type: String, required: true }, // matches User.businessId / Shoe.businessId
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, required: true, trim: true }, // e.g. "Clipper", "Printer", "Shoe rack"
    category: { type: String, default: '' }, // optional grouping, e.g. "Tools", "Furniture", "Electronics"
    quantity: { type: Number, required: true, min: 1, default: 1 },

    condition: {
      type: String,
      enum: ['new', 'good', 'fair', 'needs-repair', 'faulty'],
      default: 'good',
    },

    notes: { type: String, default: '' },

    status: {
      type: String,
      enum: ['pending', 'reviewed'],
      default: 'pending',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Equipment', equipmentSchema);