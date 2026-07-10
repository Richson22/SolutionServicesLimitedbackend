// server/models/Appointment.js

const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    business: { type: String, default: 'Barbing Salon' }, // hardcoded for now — only Barbing Salon has appointments
    category: { type: String, default: 'Grooming' }, // e.g. "Haircut", "Home Service"
    service: { type: String, required: true }, // e.g. "Fade Cut"
    providerName: { type: String, default: null }, // barber's name — null until a staff member accepts
    providerImage: { type: String }, // optional photo URL
    date: { type: Date, required: true },
    startTime: { type: String, required: true }, // e.g. "10:00 AM"
    endTime: { type: String, required: true }, // e.g. "10:30 AM"
    status: {
      type: String,
      enum: ['confirmed', 'pending', 'cancelled', 'completed'],
      default: 'pending',
    },

    // Home-visit booking details — the barber needs these to actually show up
    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerEmail: { type: String },
    address: { type: String, required: true },

    // Payment
    paymentMethod: { type: String, enum: ['cash', 'paystack'], default: 'cash' },
    paymentReference: { type: String }, // Paystack transaction reference, if paid online
    amount: { type: Number }, // service price at time of booking, in Naira
  },
  { timestamps: true }
);

module.exports = mongoose.model('Appointment', appointmentSchema);