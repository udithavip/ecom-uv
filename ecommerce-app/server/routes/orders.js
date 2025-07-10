const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

const Order = require('../models/Order');
const Product = require('../models/Product');
const User = require('../models/User');

// @route   POST api/orders
// @desc    Create new order
// @access  Private (Authenticated Users, typically 'buyer')
router.post(
  '/',
  [
    authMiddleware,
    // authorizeRole(['buyer', 'admin']), // Any authenticated user can place an order
    [
      check('orderItems', 'Order items are required').isArray({ min: 1 }),
      check('orderItems.*.product', 'Product ID is required for order items').not().isEmpty(),
      check('orderItems.*.quantity', 'Quantity is required for order items').isInt({ gt: 0 }),
      // Price will be fetched from DB to prevent tampering
      check('shippingAddress', 'Shipping address is required').not().isEmpty(),
      check('shippingAddress.address', 'Address is required').not().isEmpty(),
      check('shippingAddress.city', 'City is required').not().isEmpty(),
      check('shippingAddress.postalCode', 'Postal code is required').not().isEmpty(),
      check('shippingAddress.country', 'Country is required').not().isEmpty(),
      check('paymentMethod', 'Payment method is required').not().isEmpty(),
      // Prices (itemsPrice, taxPrice, shippingPrice, totalPrice) will be calculated on backend
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { orderItems, shippingAddress, paymentMethod } = req.body;

    try {
      if (!orderItems || orderItems.length === 0) {
        return res.status(400).json({ msg: 'No order items' });
      }

      // 1. Fetch product details for each order item from DB to ensure valid price and stock
      const detailedOrderItems = await Promise.all(
        orderItems.map(async (item) => {
          const product = await Product.findById(item.product);
          if (!product) {
            throw new Error(`Product with ID ${item.product} not found.`);
          }
          if (product.stock < item.quantity) {
            throw new Error(`Not enough stock for ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
          }
          return {
            product: product._id,
            name: product.name,
            image: product.images && product.images.length > 0 ? product.images[0] : undefined,
            price: product.price, // Use price from DB
            quantity: item.quantity,
            seller: product.seller // Keep track of seller for this item
          };
        })
      );

      // 2. Calculate prices
      const itemsPrice = detailedOrderItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
      // Basic tax and shipping - can be made more complex
      const taxPrice = Number((0.10 * itemsPrice).toFixed(2)); // Example: 10% tax
      const shippingPrice = Number((itemsPrice > 100 ? 0 : 10).toFixed(2)); // Example: Free shipping over $100
      const totalPrice = Number((itemsPrice + taxPrice + shippingPrice).toFixed(2));

      // 3. Group items by seller to initialize sellerWiseStatus
      const sellerWiseStatusMap = new Map();
      detailedOrderItems.forEach(item => {
          if (!sellerWiseStatusMap.has(item.seller.toString())) {
              sellerWiseStatusMap.set(item.seller.toString(), {
                  sellerId: item.seller,
                  status: 'Pending' // Initial status for each seller's part of the order
              });
          }
      });

      const newOrder = new Order({
        user: req.user.id,
        orderItems: detailedOrderItems.map(item => ({ // map again to remove seller field from orderItems array
            product: item.product,
            name: item.name,
            image: item.image,
            price: item.price,
            quantity: item.quantity,
        })),
        shippingAddress,
        paymentMethod,
        itemsPrice,
        taxPrice,
        shippingPrice,
        totalPrice,
        sellerWiseStatus: Array.from(sellerWiseStatusMap.values()),
        orderStatus: 'Pending', // Initial overall status
      });

      const order = await newOrder.save();

      // 4. Update stock for each product
      await Promise.all(
        detailedOrderItems.map(async (item) => {
          await Product.findByIdAndUpdate(item.product, {
            $inc: { stock: -item.quantity },
          });
        })
      );

      res.status(201).json(order);
    } catch (err) {
      console.error(err.message);
      // Check for specific error messages thrown above
      if (err.message.startsWith('Product with ID') || err.message.startsWith('Not enough stock')) {
        return res.status(400).json({ msg: err.message });
      }
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/orders/myorders
// @desc    Get logged in user's orders
// @access  Private
router.get('/myorders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/orders
// @desc    Get all orders (Admin only)
// @access  Private (Admin)
router.get('/', [authMiddleware, authorizeRole('admin')], async (req, res) => {
  try {
    const orders = await Order.find({})
      .populate('user', 'id name email')
      .populate('orderItems.product', 'name')
      .populate('sellerWiseStatus.sellerId', 'name email')
      .sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/orders/seller
// @desc    Get all orders relevant to the logged-in seller
// @access  Private (Seller)
router.get('/seller', [authMiddleware, authorizeRole('seller')], async (req, res) => {
    try {
        // Find orders where at least one item's seller or one sellerWiseStatus entry matches the logged-in seller
        const orders = await Order.find({
            $or: [
                { 'orderItems.seller': req.user.id }, // This check requires 'seller' field in orderItems during creation if used, or a more complex aggregation
                { 'sellerWiseStatus.sellerId': req.user.id }
            ]
        })
        .populate('user', 'id name email')
        .populate('orderItems.product', 'name price') // Populate product details
        .sort({ createdAt: -1 });

        // Filter orderItems to only show items relevant to this seller for their view
        const sellerOrders = orders.map(order => {
            const relevantItems = order.orderItems.filter(async item => {
                // This is tricky because orderItems don't directly store seller ID after creation in current simplified model.
                // We rely on sellerWiseStatus or need to fetch product again. Let's use sellerWiseStatus.
                // A better approach: during order creation, store sellerId in each orderItem for easier lookup.
                // For now, we assume the sellerWiseStatus covers all sellers involved.
                const productDetails = await Product.findById(item.product); // inefficient, consider denormalizing sellerId in OrderItemSchema
                return productDetails && productDetails.seller.toString() === req.user.id;
            });
            // This filtering of orderItems is more complex than it seems and might be better handled on client or with aggregation.
            // For now, returning full order, client can filter/display relevant parts.
            // Or, more simply, just return orders where this seller is listed in sellerWiseStatus
            return order;
        });

        res.json(sellerOrders);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   GET api/orders/:id
// @desc    Get order by ID
// @access  Private (User who owns, or Admin, or Seller if their product is in it)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
        .populate('user', 'name email')
        .populate('orderItems.product', 'name price images seller') // Populate seller from product
        .populate('sellerWiseStatus.sellerId', 'name email');

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // Authorization:
    // 1. User who placed the order
    // 2. Admin
    // 3. Seller whose product is in the order
    const isOwner = order.user._id.toString() === req.user.id;
    const isAdmin = req.user.role === 'admin';
    const isSellerInOrder = order.sellerWiseStatus.some(sws => sws.sellerId._id.toString() === req.user.id);


    if (!isOwner && !isAdmin && !isSellerInOrder) {
        return res.status(401).json({ msg: 'User not authorized to view this order' });
    }

    res.json(order);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Order not found' });
    }
    res.status(500).send('Server Error');
  }
});


// @route   PUT api/orders/:id/pay
// @desc    Update order to paid
// @access  Private (Admin or system calls post-payment)
router.put('/:id/pay', [authMiddleware, authorizeRole(['admin', 'seller'])], async (req, res) => { // Seller might confirm payment for COD? Or admin only.
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // For simplicity, admin can mark as paid. In reality, this would be after payment gateway confirmation.
    // If a seller is allowed, they should only be able to mark their part as paid or confirm COD for their items.
    // This current logic marks the whole order as paid.

    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = { // Example, actual data from payment gateway
      id: req.body.paymentId || 'sample_payment_id',
      status: req.body.status || 'COMPLETED',
      update_time: req.body.update_time || Date.now(),
      email_address: req.body.payer_email || order.user.email, // Assuming user email if not provided
    };
    // Potentially update orderStatus if payment was pending
    if(order.orderStatus === 'Pending' || order.orderStatus === 'Payment Failed') {
        order.orderStatus = 'Processing'; // Or based on sellerWiseStatus logic
    }

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/orders/:id/deliver
// @desc    Update order to delivered (overall status)
// @access  Private (Admin) - Individual sellers update their part via /status
router.put('/:id/deliver', [authMiddleware, authorizeRole('admin')], async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ msg: 'Order not found' });
    }

    // This marks the entire order as delivered.
    // More granular control for sellers to mark their items as shipped/delivered is in /status
    order.isDelivered = true;
    order.deliveredAt = Date.now();
    order.orderStatus = 'Delivered'; // Update overall status

    // Optionally, update all sellerWiseStatus to Delivered if admin forces overall delivery
    // order.sellerWiseStatus.forEach(sws => sws.status = 'Delivered');

    const updatedOrder = await order.save();
    res.json(updatedOrder);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   PUT api/orders/:orderId/seller/:sellerId/status
// @desc    Update status for a specific seller's items in an order
// @access  Private (Seller who owns the items, or Admin)
router.put(
    '/:orderId/seller/:sellerInOrderStatusId/status', // Use the _id of the sellerWiseStatus entry
    [
        authMiddleware,
        authorizeRole(['seller', 'admin']),
        check('status', 'Status is required').isIn(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']),
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { orderId, sellerInOrderStatusId } = req.params;
        const { status } = req.body;

        try {
            const order = await Order.findById(orderId);
            if (!order) {
                return res.status(404).json({ msg: 'Order not found' });
            }

            const sellerStatusEntry = order.sellerWiseStatus.id(sellerInOrderStatusId);
            if (!sellerStatusEntry) {
                return res.status(404).json({ msg: 'Seller status entry not found for this order.' });
            }

            // Authorization: Check if logged-in user is the seller for this part of the order or an admin
            if (req.user.role !== 'admin' && sellerStatusEntry.sellerId.toString() !== req.user.id) {
                return res.status(403).json({ msg: 'User not authorized to update this part of the order.' });
            }

            sellerStatusEntry.status = status;

            // Logic to update overall order status based on sellerWiseStatus
            // For example, if all seller parts are 'Delivered', set overall to 'Delivered'
            const allDelivered = order.sellerWiseStatus.every(sws => sws.status === 'Delivered');
            const anyCancelled = order.sellerWiseStatus.some(sws => sws.status === 'Cancelled');
            // Add more complex logic as needed
            if (allDelivered) {
                order.orderStatus = 'Delivered';
                order.isDelivered = true;
                order.deliveredAt = Date.now();
            } else if (anyCancelled) {
                // Partial cancellation logic could be complex.
                // If all are cancelled, then orderStatus = 'Cancelled'
                if (order.sellerWiseStatus.every(sws => sws.status === 'Cancelled')) {
                     order.orderStatus = 'Cancelled';
                } else {
                    // Potentially a "Partially Shipped" or "Partially Cancelled" status
                    order.orderStatus = 'Processing'; // Or some other relevant status
                }
            } else if (order.sellerWiseStatus.every(sws => sws.status === 'Shipped')) {
                order.orderStatus = 'Shipped';
            } else if (order.sellerWiseStatus.some(sws => sws.status === 'Processing' || sws.status === 'Shipped')) {
                 order.orderStatus = 'Processing';
            }


            await order.save();
            res.json(order);
        } catch (err) {
            console.error(err.message);
            if (err.kind === 'ObjectId') {
                return res.status(404).json({ msg: 'Invalid ID format.' });
            }
            res.status(500).send('Server Error');
        }
    }
);


module.exports = router;
