const express = require('express');
const router = express.Router();

const ShoeRecord = require('../models/ShoeRecord');
const { verifyToken, requireRole, requireOwnBusiness } = require('../middleware/auth');

router.get(
  '/:businessId/prices',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  async (req, res) => {
    try {
      const products = await ShoeRecord.find({
        business: req.params.businessId,
        type: 'arrival',
        status: 'approved',
        price: { $gt: 0 },
      })
        .select('shoeName title size price imageUrl createdAt')
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
      const { shoeName, size, price, quantity } = req.body;

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
      })
        .sort({ createdAt: -1 })
        .select('imageUrl')
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