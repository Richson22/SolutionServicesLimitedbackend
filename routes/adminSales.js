const express = require('express');
const router = express.Router();

const ShoeRecord = require('../models/ShoeRecord');
const { verifyToken, requireRole } = require('../middleware/auth');

// GET /api/admin/:businessId/sales?from=ISO_DATE&to=ISO_DATE
// Every sale the cashier has recorded for this business, newest first.
// No approval step: a sale counts as soon as the cashier confirms it.
router.get(
  '/:businessId/sales',
  verifyToken,
  requireRole('admin'),
  async (req, res) => {
    try {
      const filter = { business: req.params.businessId, type: 'sale' };

      // Optional date range (the page sends these for Today / Last 7 days / etc.)
      const range = {};
      const from = req.query.from ? new Date(req.query.from) : null;
      const to = req.query.to ? new Date(req.query.to) : null;
      if (from && !isNaN(from)) range.$gte = from;
      if (to && !isNaN(to)) range.$lte = to;
      if (Object.keys(range).length) filter.createdAt = range;

      const sales = await ShoeRecord.find(filter)
        .select('shoeName title size category quantity price imageUrl manager createdAt')
        .populate('manager', 'name')
        .sort({ createdAt: -1 })
        .lean();

      res.json({ sales });
    } catch (err) {
      console.error('Error loading sales:', err);
      res.status(500).json({ message: 'Could not load sales' });
    }
  }
);

module.exports = router;