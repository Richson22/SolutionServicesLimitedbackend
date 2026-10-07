// server/controllers/shoeController.js
//
// Needs Node 18+ (built-in fetch) and the Cloudinary "AI Background Removal" add-on
// switched on in your Cloudinary account.

const cloudinary = require('../config/cloudinary');
const Shoe = require('../models/Shoe');
const { SHOE_CATEGORIES, CLOTHES_CATEGORIES } = require('../models/Shoe');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Builds the cut-out URL for an uploaded image and waits until Cloudinary has finished
 * producing it. Cloudinary answers 423 while the AI is still working, so we retry.
 * Returns the URL when ready, or '' if it could not be produced (add-on off, timeout...).
 */
async function makeCutout(publicId) {
  const url = cloudinary.url(publicId, {
    secure: true,
    effect: 'background_removal',
    format: 'png',
  });

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return url;
      if (res.status !== 423) {
        console.error('Background removal failed:', res.status, res.headers.get('x-cld-error'));
        return '';
      }
    } catch (err) {
      console.error('Background removal request error:', err.message);
      return '';
    }
    await sleep(2500); // still processing, try again
  }
  return '';
}

/**
 * POST /api/admin/shoes
 * Body (multipart/form-data): { name, price, description, kind, category, badge, businessId,
 *                               removeBackground, image }
 */
async function createShoe(req, res) {
  try {
    const { name, price, description, category, badge, businessId } = req.body;
    const kind = req.body.kind === 'clothes' ? 'clothes' : 'shoes';
    const removeBackground = req.body.removeBackground === 'true';

    if (!name || !price || !description || !category || !businessId) {
      return res.status(400).json({
        success: false,
        message: 'name, price, description, category, and businessId are required',
      });
    }

    const allowed = kind === 'clothes' ? CLOTHES_CATEGORIES : SHOE_CATEGORIES;
    if (!allowed.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `Category "${category}" is not valid for ${kind}`,
      });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image is required' });
    }

    let cutoutImage = '';
    let cutoutFailed = false;
    if (removeBackground) {
      cutoutImage = await makeCutout(req.file.filename);
      cutoutFailed = !cutoutImage;
    }

    const shoe = await Shoe.create({
      name,
      price,
      description,
      kind,
      category,
      badge,
      businessId,
      image: req.file.path,
      imagePublicId: req.file.filename,
      cutoutImage,
    });

    return res.status(201).json({
      success: true,
      message: cutoutFailed
        ? 'Posted with the original photo. The background could not be removed.'
        : 'Item posted',
      cutoutFailed,
      shoe,
    });
  } catch (err) {
    console.error('createShoe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to post item' });
  }
}

/**
 * GET /api/admin/shoes
 * Query (optional): ?businessId=...&kind=shoes|clothes
 */
async function listShoesAdmin(req, res) {
  try {
    const filter = {};
    if (req.query.businessId) filter.businessId = req.query.businessId;
    if (req.query.kind === 'clothes') filter.kind = 'clothes';
    if (req.query.kind === 'shoes') filter.kind = { $ne: 'clothes' }; // old items have no kind

    const shoes = await Shoe.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({ success: true, shoes });
  } catch (err) {
    console.error('listShoesAdmin error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load items' });
  }
}

/**
 * DELETE /api/admin/shoes/:id
 * Removes the listing. The cut-out is made from the same Cloudinary asset,
 * so deleting it also removes the cut-out.
 */
async function deleteShoe(req, res) {
  try {
    const shoe = await Shoe.findById(req.params.id);
    if (!shoe) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }

    await cloudinary.uploader.destroy(shoe.imagePublicId, { invalidate: true });
    await shoe.deleteOne();

    return res.status(200).json({ success: true, message: 'Item removed' });
  } catch (err) {
    console.error('deleteShoe error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete item' });
  }
}

/**
 * GET /api/shoes
 * Public route. Optional: ?kind=shoes or ?kind=clothes. Without it, everything is returned.
 */
async function listShoesPublic(req, res) {
  try {
    const filter = {};
    if (req.query.kind === 'clothes') filter.kind = 'clothes';
    if (req.query.kind === 'shoes') filter.kind = { $ne: 'clothes' };

    const shoes = await Shoe.find(filter).sort({ createdAt: -1 });

    const formatted = shoes.map((s) => ({
      id: s._id,
      name: s.name,
      price: s.price,
      description: s.description,
      kind: s.kind || 'shoes',
      category: s.category,
      badge: s.badge,
      image: s.cutoutImage || s.image, // clean cut-out when there is one
      cutout: Boolean(s.cutoutImage),
      originalImage: s.image,
    }));

    return res.status(200).json(formatted);
  } catch (err) {
    console.error('listShoesPublic error:', err);
    return res.status(500).json([]);
  }
}

module.exports = { createShoe, listShoesAdmin, deleteShoe, listShoesPublic };