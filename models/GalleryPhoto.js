const mongoose = require('mongoose');

const galleryPhotoSchema = new mongoose.Schema(
  {
    business: { type: String, default: 'style-zone', index: true },
    url: { type: String, required: true },
    publicId: { type: String, default: '' },
    mediaType: { type: String, enum: ['image', 'video'], default: 'image' },
    title: { type: String, default: '', trim: true },
    category: { type: String, default: 'Other', trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('GalleryPhoto', galleryPhotoSchema);