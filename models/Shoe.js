// server/models/Shoe.js
const mongoose = require('mongoose');

const SHOE_CATEGORIES = ['Formal', 'Sneakers', 'Limited'];
const CLOTHES_CATEGORIES = ['Tops', 'Bottoms', 'Sets', 'Outerwear', 'Accessories', 'Other'];

const shoeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true },
    description: { type: String, required: true },
    // 'shoes' or 'clothes'. Existing documents have no value, so they are treated as shoes.
    kind: { type: String, enum: ['shoes', 'clothes'], default: 'shoes' },
    category: { type: String, required: true, enum: [...SHOE_CATEGORIES, ...CLOTHES_CATEGORIES] },
    badge: { type: String, default: '' },
    businessId: { type: String, required: true },
    image: { type: String, required: true },        // original photo (Cloudinary secure_url)
    imagePublicId: { type: String, required: true }, // needed to delete the image from Cloudinary later
    cutoutImage: { type: String, default: '' },      // clean PNG with the background removed (same Cloudinary asset)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Shoe', shoeSchema);
module.exports.SHOE_CATEGORIES = SHOE_CATEGORIES;
module.exports.CLOTHES_CATEGORIES = CLOTHES_CATEGORIES;