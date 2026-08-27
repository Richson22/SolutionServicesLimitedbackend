const Equipment = require('../models/Equipment');

// POST /api/general-manager/equipment
async function createEquipment(req, res) {
  try {
    const { business, name, category, quantity, condition, notes } = req.body;

    if (!business || !name) {
      return res.status(400).json({ success: false, message: 'Business and equipment name are required.' });
    }

    const equipment = await Equipment.create({
      business,
      addedBy: req.user.id,
      name,
      category: category || '',
      quantity: Number(quantity) || 1,
      condition: condition || 'good',
      notes: notes || '',
    });

    res.status(201).json({ success: true, equipment });
  } catch (err) {
    console.error('Error creating equipment:', err);
    res.status(500).json({ success: false, message: 'Failed to log equipment' });
  }
}

// GET /api/general-manager/equipment?business=XpressSolution-1
// Also used by admin via GET /api/admin/equipment?business=...&status=...
async function listEquipment(req, res) {
  try {
    const { business, status } = req.query;
    const filter = {};
    if (business) filter.business = business;
    if (status) filter.status = status;

    const equipment = await Equipment.find(filter)
      .sort({ createdAt: -1 })
      .populate('addedBy', 'name')
      .lean();

    res.json({ success: true, equipment });
  } catch (err) {
    console.error('Error loading equipment:', err);
    res.status(500).json({ success: false, message: 'Failed to load equipment' });
  }
}

// PATCH /api/admin/equipment/:id/status   body: { status: 'pending' | 'reviewed' }
async function updateEquipmentStatus(req, res) {
  try {
    const { status } = req.body;
    if (!['pending', 'reviewed'].includes(status)) {
      return res.status(400).json({ success: false, message: "status must be 'pending' or 'reviewed'" });
    }

    const equipment = await Equipment.findByIdAndUpdate(req.params.id, { status }, { new: true })
      .populate('addedBy', 'name');

    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }

    res.json({ success: true, equipment });
  } catch (err) {
    console.error('Error updating equipment status:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
}

// DELETE /api/admin/equipment/:id
async function deleteEquipment(req, res) {
  try {
    const equipment = await Equipment.findByIdAndDelete(req.params.id);
    if (!equipment) {
      return res.status(404).json({ success: false, message: 'Equipment not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting equipment:', err);
    res.status(500).json({ success: false, message: 'Failed to delete equipment' });
  }
}

module.exports = { createEquipment, listEquipment, updateEquipmentStatus, deleteEquipment };