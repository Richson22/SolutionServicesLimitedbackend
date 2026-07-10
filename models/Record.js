// server/models/Record.js
//
// Represents a record a manager sends in for admin review
// (e.g. a sales report, incident note, stock update — whatever your
// managers submit). Adjust `title`/`content` fields to match your
// actual use case if it's more specific than a generic note.

const mongoose = require('mongoose');

const serviceEntrySchema = new mongoose.Schema(
  {
    service: { type: String, required: true },
    price: { type: Number, required: true },
    barber: { type: String, required: true },
  },
  { _id: false }
);

const expenseEntrySchema = new mongoose.Schema(
  {
    label: { type: String, required: true },
    amount: { type: Number, required: true },
  },
  { _id: false }
);

const recordSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, default: '' },
    business: { type: String, required: true }, // matches User.businessId / Shoe.businessId (plain string for now)
    manager: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },

    // Weekly breakdown — populated by the manager's "Send Weekly Record" flow.
    services: { type: [serviceEntrySchema], default: [] },
    expenses: { type: [expenseEntrySchema], default: [] },
    weeklyIncome: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    netTotal: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Record', recordSchema);