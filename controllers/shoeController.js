// server/controllers/shoeController.js
//
// ASSUMPTIONS (adjust to match your real setup):
// - Sits behind requireAdmin middleware for the admin-only endpoints (req.user.role === 'admin')
// - The `image` field on a Shoe is populated by multer-storage-cloudinary (req.file.path / req.file.filename)
//
// npm install cloudinary multer multer-storage-cloudinary

const cloudinary = require('../config/cloudinary');
const Shoe = require('../models/Shoe');

/**
 * POST /api/admin/shoes
 * Body (multipart/form-data): { name, price, description, category, badge, businessId, image }
 * Creates a new shoe listing. The uploaded image is stored on Cloudinary by the
 * upload middleware before this handler runs — req.file.path is the resulting URL.
 */
async function createShoe(req, res) {
  try {
    const { name, price, description, category, badge, businessId } = req.body;

    if (!name || !price || !description || !category || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'name, price, description, category, and businessId are required',
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    const shoe = await Shoe.create({
      name,
      price,
      description,
      category,
      badge,
      businessId,
      image: req.file.path,
      imagePublicId: req.file.filename,
    });

    return res.status(201).json({ success: true, message: 'Shoe posted', shoe });
  } catch (err) {
    console.error('createShoe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to post shoe' });
  }
}

/**
 * GET /api/admin/shoes
 * Query (optional): ?businessId=...
 * Lists all shoes, newest first. Admin-only view used for managing listings.
 */
async function listShoesAdmin(req, res) {
  try {
    const filter = {};
    if (req.query.businessId) filter.businessId = req.query.businessId;

    const shoes = await Shoe.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, shoes });
  } catch (err) {
    console.error('listShoesAdmin error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load shoes' });
  }
}

/**
 * DELETE /api/admin/shoes/:id
 * Removes a shoe listing and its image from Cloudinary.
 */
async function deleteShoe(req, res) {
  try {
    const shoe = await Shoe.findById(req.params.id);
    if (!shoe) {
      return res.status(404).json({ success: false, message: 'Shoe not found' });
    }

    await cloudinary.uploader.destroy(shoe.imagePublicId);
    await shoe.deleteOne();

    return res.status(200).json({ success: true, message: 'Shoe removed' });
  } catch (err) {
    console.error('deleteShoe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete shoe' });
  }
}

/**
 * GET /api/shoes
 * Public route — powers the customer-facing ShoeStore page.
 * No auth required.
 */
async function listShoesPublic(req, res) {
  try {
    const shoes = await Shoe.find().sort({ createdAt: -1 });

    const formatted = shoes.map((s) => ({
      id: s._id,
      name: s.name,
      price: s.price,
      description: s.description,
      category: s.category,
      badge: s.badge,
      image: s.image,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('listShoesPublic error:', err);
    return res.status(500).json([]);
  }
}

module.exports = { createShoe, listShoesAdmin, deleteShoe, listShoesPublic };