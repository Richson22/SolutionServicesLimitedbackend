const express = require('express');
const router = express.Router();

const ShoeRecord = require('../models/ShoeRecord');
const { verifyToken, requireRole, requireOwnBusiness } = require('../middleware/auth');

const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const saleImageStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'shoe-record-images', // same folder the manager photos go to
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    public_id: (req, file) => `sale-${req.user.id}-${Date.now()}`,
  },
});
const uploadSaleImage = multer({ storage: saleImageStorage, limits: { fileSize: 10 * 1024 * 1024 } });

// If the photo fails, the sale is still saved and the cashier is told the photo wasn't
function handleImageUpload(req, res, next) {
  uploadSaleImage.single('image')(req, res, (err) => {
    if (err) {
      console.error('Sale photo upload error:', err);
      req.uploadWarning = err.code === 'LIMIT_FILE_SIZE'
        ? 'Photo is too large (max 10MB).'
        : `Photo upload failed: ${err.message || 'unsupported file'}`;
    }
    next();
  });
}

router.get(
  '/:businessId/sales',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  async (req, res) => {
    try {
      const filter = { business: req.params.businessId, type: 'sale' };
      const { category } = req.query;
      if (category === 'clothes' || category === 'watches') filter.category = category;
      else if (category === 'shoe') filter.category = { $nin: ['clothes', 'watches'] };

      const sales = await ShoeRecord.find(filter)
        .select('shoeName title size category quantity price imageUrl createdAt soldAt manager')
        .populate('manager', 'name')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ sales });
    } catch (err) {
      console.error('Error loading cashier sales:', err);
      res.status(500).json({ message: 'Could not load sales' });
    }
  }
);

router.get(
  '/:businessId/prices',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  async (req, res) => {
    try {
      const { category } = req.query;
      const filter = {
        business: req.params.businessId,
        type: 'arrival',
        status: 'approved',
        price: { $gt: 0 },
      };

      if (category === 'clothes' || category === 'watches') filter.category = category;
      else if (category === 'shoe') filter.category = { $nin: ['clothes', 'watches'] };

      const products = await ShoeRecord.find({
        ...filter,
      })
        .select('shoeName title size price imageUrl category createdAt')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ products });
    } catch (err) {
      console.error('Error loading cashier prices:', err);
      res.status(500).json({ message: 'Could not load prices' });
    }
  }
);

// POST /api/cashier/:businessId/sell
// Cashier records a sale. Creates a pending ShoeRecord (type: 'sale') that
// shows up in the admin Records page for approval.
router.post(
  '/:businessId/sell',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  async (req, res) => {
    try {
      const { shoeName, size, price, quantity, category } = req.body;

      if (!shoeName || !price) {
        return res.status(400).json({ success: false, message: 'shoeName and price are required' });
      }

      const qty = Math.max(1, Number(quantity) || 1);

      // Pull the photo from the matching arrival, if one exists
      const matchingArrival = await ShoeRecord.findOne({
        business: req.params.businessId,
        type: 'arrival',
        shoeName,
        size: size || '',
        category: category === 'clothes' || category === 'watches' ? category : { $nin: ['clothes', 'watches'] },
      })
        .sort({ createdAt: -1 })
        .select('imageUrl category')
        .lean();

      const record = await ShoeRecord.create({
        type: 'sale',
        business: req.params.businessId,
        manager: req.user.id, // the cashier who made this sale
        title: `Sale: ${shoeName}${size ? ` (${size})` : ''}`,
        shoeName,
        size: size || '',
        quantity: qty,
        price: Number(price),
        imageUrl: matchingArrival?.imageUrl || '',
        category: matchingArrival?.category || (category === 'clothes' || category === 'watches' ? category : 'shoe'),
        status: 'pending',
      });

      res.status(201).json({ success: true, record });
    } catch (err) {
      console.error('Error recording sale:', err);
      res.status(500).json({ success: false, message: 'Could not record sale' });
    }
  }
);

// POST /api/cashier/:businessId/sales
// Cashier records a sale with its date and an optional photo (multipart/form-data).
router.post(
  '/:businessId/sales',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  handleImageUpload,
  async (req, res) => {
    try {
      const { itemName, size, price, quantity, category, soldAt } = req.body;

      if (!itemName || !(Number(price) > 0)) {
        return res.status(400).json({ success: false, message: 'Item sold and amount are required' });
      }

      const qty = Math.max(1, Number(quantity) || 1);
      const cat = category === 'clothes' || category === 'watches' ? category : 'shoe';

      // The date the sale happened (noon Nigeria time), never in the future
      const dateOk = /^\d{4}-\d{2}-\d{2}$/.test(soldAt || '');
      const when = dateOk ? new Date(`${soldAt}T12:00:00+01:00`) : new Date();
      if (when.getTime() > Date.now() + 24 * 3600 * 1000) {
        return res.status(400).json({ success: false, message: 'Sale date cannot be in the future' });
      }

      // The photo they took; otherwise the matching arrival's photo (same as /sell)
      let imageUrl = req.file ? req.file.path : '';
      if (!imageUrl) {
        const arrival = await ShoeRecord.findOne({
          business: req.params.businessId, type: 'arrival', shoeName: itemName, size: size || '',
        }).sort({ createdAt: -1 }).select('imageUrl').lean();
        imageUrl = arrival?.imageUrl || '';
      }

      const record = await ShoeRecord.create({
        type: 'sale',
        business: req.params.businessId,
        manager: req.user.id, // the cashier
        title: `Sale: ${itemName}${size ? ` (${size})` : ''}`,
        shoeName: itemName,
        size: size || '',
        quantity: qty,
        price: Number(price),
        category: cat,
        soldAt: when,
        imageUrl,
        status: 'pending',
      });

      res.status(201).json({ success: true, record, warning: req.uploadWarning || null });
    } catch (err) {
      console.error('Error recording cashier sale:', err);
      res.status(500).json({ success: false, message: 'Could not record this sale' });
    }
  }
);

module.exports = router;