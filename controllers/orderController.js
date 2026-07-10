// server/controllers/orderController.js
//
// ASSUMPTION: verifyToken middleware has run and set req.user = { id, role, businessId }

const Order = require('../models/Order');
const Shoe = require('../models/Shoe');
const { verifyTransaction } = require('../utils/paystack');

// POST /api/orders
// Body: {
//   items: [{ shoeId, quantity }],   <- only shoeId + quantity trusted from the client
//   customerName, customerPhone, customerEmail, deliveryAddress,
//   paymentReference
// }
async function createOrder(req, res) {
  try {
    const { items, customerName, customerPhone, customerEmail, deliveryAddress, paymentReference } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Cart is empty' });
    }
    if (!customerName || !customerPhone || !customerEmail || !deliveryAddress) {
      return res.status(400).json({ success: false, message: 'customerName, customerPhone, customerEmail, and deliveryAddress are required' });
    }
    if (!paymentReference) {
      return res.status(400).json({ success: false, message: 'paymentReference is required' });
    }

    // Rebuild the order from the DATABASE's current shoe prices — never trust
    // a price sent from the frontend, since someone could edit it in DevTools
    // before the Paystack popup even opens.
    const orderItems = [];
    let recalculatedTotal = 0;

    for (const item of items) {
      const shoe = await Shoe.findById(item.shoeId);
      if (!shoe) {
        return res.status(400).json({ success: false, message: `A shoe in your cart is no longer available (${item.shoeId})` });
      }
      const quantity = Math.max(1, Number(item.quantity) || 1);
      orderItems.push({
        shoeId: shoe._id,
        name: shoe.name,
        price: shoe.price,
        quantity,
        image: shoe.image,
      });
      recalculatedTotal += shoe.price * quantity;
    }

    // Verify the payment actually happened, and that what was actually paid
    // matches the recalculated total — not whatever the frontend claims.
    const verification = await verifyTransaction(paymentReference);
    if (!verification.success) {
      return res.status(402).json({
        success: false,
        message: `Payment could not be verified (status: ${verification.status}). Please try again or contact support.`,
      });
    }

    const expectedKobo = Math.round(recalculatedTotal * 100);
    if (verification.amountKobo !== expectedKobo) {
      console.warn(
        `Order amount mismatch for reference ${paymentReference}: expected ${expectedKobo} kobo, Paystack reports ${verification.amountKobo} kobo`
      );
      return res.status(402).json({
        success: false,
        message: 'Payment amount does not match your cart total. Please contact support.',
      });
    }

    // Prevent the same paymentReference being used to create two orders
    // (e.g. a double-click, or someone replaying an old successful reference).
    const existing = await Order.findOne({ paymentReference });
    if (existing) {
      return res.status(200).json({ success: true, order: existing, alreadyProcessed: true });
    }

    const order = await Order.create({
      userId: req.user.id,
      items: orderItems,
      totalAmount: recalculatedTotal,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      paymentMethod: 'paystack',
      paymentReference,
      status: 'paid',
    });

    return res.status(201).json({ success: true, order });
  } catch (err) {
    console.error('createOrder error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create order' });
  }
}

// GET /api/orders
// The logged-in customer's own order history
async function getMyOrders(req, res) {
  try {
    const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
    return res.status(200).json(orders);
  } catch (err) {
    console.error('getMyOrders error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load orders' });
  }
}

module.exports = { createOrder, getMyOrders };