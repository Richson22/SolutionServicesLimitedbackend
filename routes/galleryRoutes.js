// Mount in server.js:  app.use('/api/gallery', galleryRoutes);
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const GalleryPhoto = require('../models/GalleryPhoto');
const { verifyToken, requireRole } = require('../middleware/auth');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  params: async (req, file) => {
    const isVideo = (file.mimetype || '').startsWith('video/');
    return {
      folder: 'style-zone-gallery',
      resource_type: isVideo ? 'video' : 'image',
      allowed_formats: isVideo ? ['mp4', 'mov', 'webm', 'm4v'] : ['jpg', 'jpeg', 'png', 'webp'],
      public_id: `style-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
      ...(isVideo ? {} : { transformation: [{ width: 1600, crop: 'limit', quality: 'auto' }] }),
    };
  },
});
// photos up to 10MB are fine; videos can be bigger
const upload = multer({ storage, limits: { fileSize: 60 * 1024 * 1024 } });

const adminOnly = [verifyToken, requireRole('admin')];

const toRow = (p) => {
  const isVideo = p.mediaType === 'video';
  return {
    id: p._id,
    // videos are delivered as mp4 so every phone and browser can play them
    url: isVideo ? p.url.replace('/upload/', '/upload/f_mp4,q_auto/') : p.url,
    poster: isVideo ? p.url.replace('/upload/', '/upload/so_0,f_jpg,w_600/').replace(/\.\w+$/, '.jpg') : '',
    mediaType: p.mediaType || 'image',
    title: p.title || '',
    category: p.category || 'Other',
    business: p.business,
    createdAt: p.createdAt,
  };
};

// Public: the landing page reads this
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.business) filter.business = req.query.business;
    const photos = await GalleryPhoto.find(filter).sort({ createdAt: -1 }).lean();
    res.json(photos.map(toRow));
  } catch (err) {
    console.error('gallery list error:', err);
    res.status(500).json({ message: 'Could not load gallery' });
  }
});

// Admin: upload one photo or video (the page sends several, one request each)
router.post('/', adminOnly, (req, res) => {
  upload.single('image')(req, res, async (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File is too large (photos up to 10MB, videos up to 60MB).'
        : `Upload failed: ${err.message || 'unsupported file'}`;
      return res.status(400).json({ message });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a photo or video first' });
    try {
      const photo = await GalleryPhoto.create({
        business: req.body.business || 'style-zone',
        url: req.file.path,
        publicId: req.file.filename || '',
        mediaType: (req.file.mimetype || '').startsWith('video/') ? 'video' : 'image',
        title: (req.body.title || '').trim(),
        category: (req.body.category || 'Other').trim(),
        createdBy: req.user.id,
      });
      res.status(201).json(toRow(photo));
    } catch (e) {
      console.error('gallery save error:', e);
      res.status(500).json({ message: 'Could not save photo' });
    }
  });
});

// Admin: remove a photo
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const photo = await GalleryPhoto.findById(req.params.id);
    if (!photo) return res.status(404).json({ message: 'Photo not found' });
    if (photo.publicId) {
      try { await cloudinary.uploader.destroy(photo.publicId, { resource_type: photo.mediaType === 'video' ? 'video' : 'image' }); } catch (e) { console.error('cloudinary destroy:', e.message); }
    }
    await photo.deleteOne();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: 'Could not delete photo' });
  }
});

module.exports = router;