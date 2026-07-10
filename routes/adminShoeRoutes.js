// server/routes/adminShoeRoutes.js
const express = require('express');
const router = express.Router();
const requireAdmin = require('../middleware/requireAdmin');
const upload = require('../middleware/upload');
const { createShoe, listShoesAdmin, deleteShoe } = require('../controllers/shoeController');

router.post('/', requireAdmin, upload.single('image'), createShoe);
router.get('/', requireAdmin, listShoesAdmin);
router.delete('/:id', requireAdmin, deleteShoe);

module.exports = router;