const express = require('express');
const router = express.Router();

const { verifyToken, requireRole } = require('../middleware/auth');
const { createEquipment, listEquipment } = require('../controllers/equipmentController');

const gmOnly = [verifyToken, requireRole('general-manager')];

// POST /api/general-manager/equipment
router.post('/equipment', gmOnly, createEquipment);

// GET /api/general-manager/equipment?business=XpressSolution-1
router.get('/equipment', gmOnly, listEquipment);

// GET /api/admin/equipment?business=XpressSolution-1&status=pending
router.get('/equipment', adminOnly, listEquipment);

// PATCH /api/admin/equipment/:id/status
router.patch('/equipment/:id/status', adminOnly, updateEquipmentStatus);

// DELETE /api/admin/equipment/:id
router.delete('/equipment/:id', adminOnly, deleteEquipment);

module.exports = router;