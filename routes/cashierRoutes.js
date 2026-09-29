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

module.exports = router;