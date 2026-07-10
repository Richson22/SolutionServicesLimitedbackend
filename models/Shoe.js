// server/models/Shoe.js
const mongoose = require('mongoose');

const shoeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    category: { type: String, required: true, enum: ['Formal', 'Sneakers', 'Limited'] },
    badge: { type: String, default: '' },
    businessId: { type: String, required: true },
    image: { type: String, required: true },        // Cloudinary secure_url
    imagePublicId: { type: String, required: true }, // needed to delete the image from Cloudinary later
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shoe', shoeSchema);