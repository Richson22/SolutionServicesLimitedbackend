// server/routes/cashierRoutes.js
// Read-only price list for cashiers.
// Reads the same ShoeRecord documents the admin prices in AdminRecords.
//
// Mount in your main app: app.use('/api/cashier', require('./routes/cashierRoutes'));

const express = require('express');
const router = express.Router();

const ShoeRecord = require('../models/ShoeRecord');
const { verifyToken, requireRole, requireOwnBusiness } = require('../middleware/auth');

// GET /api/cashier/:businessId/prices  ->  { products: [...] }
router.get(
  '/:businessId/prices',
  verifyToken,
  requireRole('cashier'),
  requireOwnBusiness,
  async (req, res) => {
    try {
      const products = await ShoeRecord.find({
        business: req.params.businessId, // ShoeRecord.business, matches User.businessId
        type: 'arrival',
        status: 'approved',
        price: { $gt: 0 },
      })
        // Whitelist only. Never send quantity, notes or manager info to cashiers.
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