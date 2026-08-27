const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/auth');
const { createEquipment, listEquipment } = require('../controllers/equipmentController');

const gmOnly = [verifyToken, requireRole('general-manager')];

// POST /api/general-manager/equipment
router.post('/equipment', gmOnly, createEquipment);

// GET /api/general-manager/equipment?business=XpressSolution-1
router.get('/equipment', gmOnly, listEquipment);

module.exports = router;