// server/routes/shoeRoutes.js
// Public route — no auth. This is what ShoeStore.jsx calls via fetch('/api/shoes')
const express = require('express');
const router = express.Router();
const { listShoesPublic } = require('../controllers/shoeController');

router.get('/', listShoesPublic);

module.exports = router;