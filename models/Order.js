// server/models/Order.js

const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema(
  {
    shoeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Shoe', required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // price at time of purchase — don't trust a later price change to retroactively alter past orders
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    items: { type: [orderItemSchema], required: true },
    totalAmount: { type: Number, required: true }, // in Naira

    customerName: { type: String, required: true },
    customerPhone: { type: String, required: true },
    customerEmail: { type: String, required: true },
    deliveryAddress: { type: String, required: true },

    paymentMethod: { type: String, enum: ['paystack'], default: 'paystack' },
    paymentReference: { type: String, required: true },

    status: {
      type: String,
      enum: ['paid', 'processing', 'shipped', 'delivered', 'cancelled'],
      default: 'paid', // orders only get created after payment is verified — see orderController.js
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Order', orderSchema);