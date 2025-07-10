const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

const Product = require('../models/Product');
const User = require('../models/User'); // Needed to check seller role

// @route   POST api/products
// @desc    Create a new product
// @access  Private (Seller or Admin)
router.post(
  '/',
  [
    authMiddleware,
    authorizeRole(['seller', 'admin']),
    [
      check('name', 'Name is required').not().isEmpty(),
      check('description', 'Description is required').not().isEmpty(),
      check('price', 'Price is required and must be a number').isNumeric().toFloat().isFloat({ gt: 0 }),
      check('category', 'Category is required').not().isEmpty(),
      check('stock', 'Stock is required and must be an integer').isInt({ gt: -1 }), // allow 0 stock
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, price, category, images, stock, isFeatured } = req.body;

    try {
      // Ensure the user creating the product is indeed a seller or admin
      // This is already handled by authorizeRole, but an explicit check can be added if needed
      // const user = await User.findById(req.user.id);
      // if (user.role !== 'seller' && user.role !== 'admin') {
      //   return res.status(403).json({ msg: 'User not authorized to sell products' });
      // }

      const newProduct = new Product({
        seller: req.user.id,
        name,
        description,
        price,
        category,
        images: images || [],
        stock,
        isFeatured: isFeatured || false,
      });

      const product = await newProduct.save();
      res.status(201).json(product);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/products
// @desc    Get all products (public, with optional filters: category, search, price range, seller)
// @access  Public
router.get('/', async (req, res) => {
  const { category, search, minPrice, maxPrice, sellerId, page = 1, limit = 10, sortBy = 'dateAdded', order = 'desc' } = req.query;
  const query = {};

  if (category) query.category = category;
  if (sellerId) query.seller = sellerId;
  if (search) query.$text = { $search: search };
  if (minPrice || maxPrice) {
    query.price = {};
    if (minPrice) query.price.$gte = parseFloat(minPrice);
    if (maxPrice) query.price.$lte = parseFloat(maxPrice);
  }

  try {
    const products = await Product.find(query)
      .populate('seller', 'name email') // Populate seller info
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 });

    const totalProducts = await Product.countDocuments(query);

    res.json({
        products,
        totalPages: Math.ceil(totalProducts / parseInt(limit)),
        currentPage: parseInt(page),
        totalProducts
    });
  } catch (err) {
    console.error(err.message);
    // If search is invalid (e.g. not a text index on schema for the fields)
    if (err.name === 'MongoError' && err.message.includes('$text')) {
        return res.status(400).json({ msg: 'Search query is invalid or text index is not configured properly.' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   GET api/products/myproducts
// @desc    Get all products for the logged-in seller
// @access  Private (Seller)
router.get('/myproducts', [authMiddleware, authorizeRole('seller')], async (req, res) => {
    try {
        const products = await Product.find({ seller: req.user.id }).sort({ dateAdded: -1 });
        if (!products) {
            return res.status(404).json({ msg: 'No products found for this seller' });
        }
        res.json(products);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   GET api/products/:id
// @desc    Get product by ID
// @access  Public
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).populate('seller', 'name email');
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.json(product);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/products/:id
// @desc    Update a product
// @access  Private (Owner Seller or Admin)
router.put(
  '/:id',
  [
    authMiddleware, // Ensures user is logged in
    // authorizeRole(['seller', 'admin']) is implicitly handled by logic below
    [
      check('name', 'Name is required').optional().not().isEmpty(),
      check('description', 'Description is required').optional().not().isEmpty(),
      check('price', 'Price must be a number').optional().isNumeric().toFloat().isFloat({ gt: 0 }),
      check('category', 'Category is required').optional().not().isEmpty(),
      check('stock', 'Stock must be an integer').optional().isInt({ gt: -1 }),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, description, price, category, images, stock, isFeatured } = req.body;
    const productFields = {};
    if (name) productFields.name = name;
    if (description) productFields.description = description;
    if (price) productFields.price = price;
    if (category) productFields.category = category;
    if (images) productFields.images = images;
    if (stock !== undefined) productFields.stock = stock; // Check for undefined to allow setting stock to 0
    if (isFeatured !== undefined) productFields.isFeatured = isFeatured;
    productFields.lastUpdated = Date.now();

    try {
      let product = await Product.findById(req.params.id);
      if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
      }

      // Authorization check: User must be the seller of the product or an admin
      if (product.seller.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(401).json({ msg: 'User not authorized to update this product' });
      }

      product = await Product.findByIdAndUpdate(
        req.params.id,
        { $set: productFields },
        { new: true }
      ).populate('seller', 'name email');

      res.json(product);
    } catch (err) {
      console.error(err.message);
      if (err.kind === 'ObjectId') {
        return res.status(404).json({ msg: 'Product not found (ObjectId error)' });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE api/products/:id
// @desc    Delete a product
// @access  Private (Owner Seller or Admin)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ msg: 'Product not found' });
    }

    // Authorization check: User must be the seller of the product or an admin
    if (product.seller.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({ msg: 'User not authorized to delete this product' });
    }

    await Product.findByIdAndRemove(req.params.id);
    // Or if you prefer soft delete:
    // product.isDeleted = true; // Add an isDeleted field to your schema
    // product.deletedAt = Date.now();
    // await product.save();

    res.json({ msg: 'Product removed' });
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Product not found' });
    }
    res.status(500).send('Server Error');
  }
});

module.exports = router;
