// server/routes/orderRoutes.js
//
// Mount this in your main app: app.use('/api/orders', orderRoutes);

const express = require('express');
const router = express.Router();

const { createOrder, getMyOrders } = require('../controllers/orderController');
const { verifyToken } = require('../middleware/auth');

router.post('/', verifyToken, createOrder);
router.get('/', verifyToken, getMyOrders);

module.exports = router;