const express = require('express');
const router = express.Router();

const ShoeRecord = require('../models/ShoeRecord');
const { verifyToken, requireRole, requireOwnBusiness } = require('../middleware/auth');

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
        .select('shoeName title size category quantity price imageUrl createdAt manager')
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

module.exports = router;