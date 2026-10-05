// server/models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true }, // stored hashed, never plain text
    role: {
  type: String,
  enum: ['student', 'staff', 'cashier', 'manager', 'general-manager', 'admin', 'customer'],
  required: true,
},
    businessId: { type: String }, // which of the 3 shops — plain string for now until you have a Business model
    mustChangePassword: { type: Boolean, default: false },
    suspended: { type: Boolean, default: false }, // blocks login when true — enforced in the login controller
  },
  { timestamps: true } // adds createdAt / updatedAt automatically
);

module.exports = mongoose.model('User', userSchema);