const express = require('express');
const router = express.Router();
const { check, validationResult } = require('express-validator');
const authMiddleware = require('../middleware/authMiddleware');
const authorizeRole = require('../middleware/roleMiddleware');

const Auction = require('../models/Auction');
const Product = require('../models/Product');
const User = require('../models/User'); // For user role checks

// Middleware to update auction status before certain operations
async function updateAuctionStatusMiddleware(req, res, next) {
    try {
        if (req.params.id) {
            const auction = await Auction.findById(req.params.id);
            if (auction) {
                auction.updateAuctionStatus();
                await auction.save();
                req.auction = auction; // Attach updated auction to request
            }
        }
        next();
    } catch (error) {
        console.error('Error updating auction status:', error);
        // Decide if this should block or just log
        // For now, let it proceed, but this could be critical
        next();
    }
}


// @route   POST api/auctions
// @desc    Create a new auction
// @access  Private (Seller or Admin)
router.post(
  '/',
  [
    authMiddleware,
    authorizeRole(['seller', 'admin']),
    [
      check('product', 'Product ID is required').not().isEmpty(),
      check('startTime', 'Start time is required').isISO8601().toDate(),
      check('endTime', 'End time is required and must be after start time').isISO8601().toDate()
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startTime)) {
                throw new Error('End time must be after start time.');
            }
            return true;
        }),
      check('startingBid', 'Starting bid is required and must be a positive number').isFloat({ gt: 0 }),
      check('reservePrice', 'Reserve price must be a non-negative number').optional().isFloat({ min: 0 }),
      check('buyNowPrice', 'Buy Now price must be a positive number').optional().isFloat({ gt: 0 }),
    ],
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { product: productId, startTime, endTime, startingBid, reservePrice, buyNowPrice } = req.body;

    try {
      // 1. Check if product exists and belongs to the seller (or user is admin)
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ msg: 'Product not found' });
      }
      if (req.user.role !== 'admin' && product.seller.toString() !== req.user.id) {
        return res.status(403).json({ msg: 'You can only create auctions for your own products.' });
      }

      // 2. Check if product is already in an active/upcoming auction
      const existingAuction = await Auction.findOne({ product: productId, status: { $in: ['Upcoming', 'Active', 'Pending'] } });
      if (existingAuction) {
        return res.status(400).json({ msg: 'This product is already in an active or upcoming auction.' });
      }

      // 3. Check if product has enough stock (e.g. stock must be at least 1 for auction)
      if (product.stock < 1) {
          return res.status(400).json({ msg: 'Product is out of stock and cannot be auctioned.' });
      }

      const newAuction = new Auction({
        product: productId,
        seller: product.seller, // or req.user.id if admin can auction on behalf of any seller (less likely)
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        startingBid,
        currentHighestBid: startingBid, // Initialize with starting bid
        reservePrice,
        buyNowPrice,
        status: new Date(startTime) <= new Date() ? 'Active' : 'Upcoming' // Set status based on start time
      });

      // If startTime is in the past but before endTime, it's Active. If startTime is future, it's Upcoming.
      // The model's updateAuctionStatus method can refine this.
      newAuction.updateAuctionStatus();


      const auction = await newAuction.save();
      res.status(201).json(auction);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/auctions
// @desc    Get all auctions (filtered by status, category, etc.)
// @access  Public
router.get('/', async (req, res) => {
  const { status = 'Active,Upcoming', category, search, page = 1, limit = 10, sortBy = 'endTime', order = 'asc' } = req.query;
  const query = {};

  if (status) {
    query.status = { $in: status.split(',') };
  }

  // To filter by category or search, we need to join with Products or denormalize product details
  // For now, direct Auction fields. A more complex query would use $lookup if not denormalized.
  // if (category) query['productDetails.category'] = category; // Assuming denormalized or populated field
  // if (search) query.$text = { $search: search }; // Requires text index on Auction or populated product fields

  try {
    // Update status of relevant auctions before querying
    // This is a heavy operation on a GET all, consider a cron job primarily
    // For demo, can run a quick check.
    // await Auction.findActiveAndUpdateStatus(); // This might be too slow for a public GET. Better to run as scheduled task.

    const auctions = await Auction.find(query)
      .populate('product', 'name description images category')
      .populate('seller', 'name email')
      .populate('currentHighestBidder', 'name')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit))
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 });

    const totalAuctions = await Auction.countDocuments(query);

    res.json({
      auctions: auctions.map(auc => { // Ensure status is up-to-date for client
          auc.updateAuctionStatus(); // Call instance method (doesn't save, just updates for response)
          return auc;
      }),
      totalPages: Math.ceil(totalAuctions / parseInt(limit)),
      currentPage: parseInt(page),
      totalAuctions,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// @route   GET api/auctions/myauctions
// @desc    Get auctions created by the logged-in seller
// @access  Private (Seller or Admin)
router.get('/myauctions', [authMiddleware, authorizeRole(['seller', 'admin'])], async (req, res) => {
    try {
        const query = { seller: req.user.id };
        if (req.user.role === 'admin' && req.query.all === 'true') {
            // Admin can optionally see all auctions if they pass ?all=true
            delete query.seller;
        }
        const auctions = await Auction.find(query)
            .populate('product', 'name images')
            .populate('currentHighestBidder', 'name')
            .sort({ createdAt: -1 });

        auctions.forEach(auction => auction.updateAuctionStatus()); // Update status for display

        res.json(auctions);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET api/auctions/:id
// @desc    Get auction by ID
// @access  Public
router.get('/:id', updateAuctionStatusMiddleware, async (req, res) => {
  try {
    // req.auction is populated by updateAuctionStatusMiddleware
    const auction = req.auction || await Auction.findById(req.params.id);

    if (!auction) {
      return res.status(404).json({ msg: 'Auction not found' });
    }

    // Increment view count (simple version)
    auction.viewCount = (auction.viewCount || 0) + 1;
    await auction.save(); // Save view count, status already saved by middleware if changed

    await auction.populate([
        { path: 'product', select: 'name description images category stock seller' }, // Include product.seller
        { path: 'seller', select: 'name email' },
        { path: 'currentHighestBidder', select: 'name email' },
        { path: 'bids.user', select: 'name email'} // Populate user in bids array
    ]);

    res.json(auction);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Auction not found' });
    }
    res.status(500).send('Server Error');
  }
});


// @route   POST api/auctions/:id/bids
// @desc    Place a bid on an auction
// @access  Private (Authenticated Users, not the seller of the auction)
router.post(
  '/:id/bids',
  [
    authMiddleware, // Any authenticated user can bid
    updateAuctionStatusMiddleware,
    check('amount', 'Bid amount is required and must be a positive number').isFloat({ gt: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { amount } = req.body;
    const auctionId = req.params.id;

    try {
      const auction = req.auction || await Auction.findById(auctionId); // auction from middleware or fetch again
      if (!auction) {
        return res.status(404).json({ msg: 'Auction not found' });
      }

      // Check 1: Auction status must be Active
      if (auction.status !== 'Active') {
        return res.status(400).json({ msg: `Auction is not active. Current status: ${auction.status}` });
      }

      // Check 2: Bidder cannot be the seller
      if (auction.seller.toString() === req.user.id) {
        return res.status(403).json({ msg: 'You cannot bid on your own auction.' });
      }

      // Check 3: Bidder cannot be the current highest bidder (prevents spamming own high bid)
      // if (auction.currentHighestBidder && auction.currentHighestBidder.toString() === req.user.id) {
      //   return res.status(400).json({ msg: 'You are already the highest bidder.' });
      // }


      // Check 4: Bid amount must be higher than current highest bid
      // Consider a minimum bid increment rule as well (e.g., 5% higher)
      const minNextBid = auction.currentHighestBid + (auction.startingBid * 0.01); // Example: min increment 1% of starting bid or a fixed value
      if (amount <= auction.currentHighestBid) {
        return res.status(400).json({ msg: `Your bid must be higher than the current bid of $${auction.currentHighestBid.toFixed(2)}.` });
      }
       if (amount < minNextBid && auction.bids.length > 0) { // Only apply min increment if there are existing bids
         return res.status(400).json({ msg: `Your bid is not high enough. Minimum next bid is $${minNextBid.toFixed(2)}.`});
       }


      // All checks passed, record the bid
      const newBid = {
        user: req.user.id,
        amount: parseFloat(amount),
        timestamp: new Date(),
      };

      auction.bids.push(newBid);
      auction.currentHighestBid = newBid.amount;
      auction.currentHighestBidder = newBid.user;

      // Optional: Extend auction end time if bid is placed near the end (anti-sniping)
      const now = new Date();
      const timeLeft = auction.endTime.getTime() - now.getTime(); // milliseconds
      if (timeLeft < 5 * 60 * 1000) { // Less than 5 minutes left
          auction.endTime = new Date(now.getTime() + 5 * 60 * 1000); // Extend by 5 minutes
          // console.log(`Auction ${auction._id} extended due to late bid.`);
      }


      await auction.save();

      // Populate user details for the bid response
      await auction.populate([
          { path: 'currentHighestBidder', select: 'name email'},
          { path: 'bids.user', select: 'name email'}
      ]);

      // TODO: Emit a WebSocket event for real-time bid updates to clients watching this auction
      // io.to(auctionId).emit('bidUpdate', { auction });

      res.json(auction);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   GET api/auctions/:id/bids
// @desc    Get bid history for an auction
// @access  Public (or restricted)
router.get('/:id/bids', updateAuctionStatusMiddleware, async (req, res) => {
    try {
        const auction = req.auction || await Auction.findById(req.params.id);
        if (!auction) {
            return res.status(404).json({ msg: 'Auction not found' });
        }
        await auction.populate('bids.user', 'name email'); // Populate user details for each bid
        res.json(auction.bids.sort((a, b) => b.timestamp - a.timestamp)); // Show newest bids first
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   PUT api/auctions/:id
// @desc    Update auction details (e.g., description, times if no bids)
// @access  Private (Owner Seller or Admin)
router.put(
  '/:id',
  [
    authMiddleware,
    updateAuctionStatusMiddleware,
    // Validation checks for fields that can be updated
    check('startTime', 'Invalid start time format').optional().isISO8601().toDate(),
    check('endTime', 'Invalid end time format').optional().isISO8601().toDate()
        .custom((value, { req }) => {
            const startTime = req.body.startTime || (req.auction ? req.auction.startTime : null);
            if (startTime && new Date(value) <= new Date(startTime)) {
                throw new Error('End time must be after start time.');
            }
            return true;
        }),
    check('reservePrice', 'Reserve price must be non-negative').optional().isFloat({ min: 0 }),
    check('buyNowPrice', 'Buy Now price must be positive').optional().isFloat({ gt: 0 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const auctionId = req.params.id;
    const updates = req.body;

    try {
      let auction = req.auction || await Auction.findById(auctionId);
      if (!auction) {
        return res.status(404).json({ msg: 'Auction not found' });
      }

      // Authorization: Must be seller or admin
      if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'User not authorized to update this auction.' });
      }

      // Business logic for updates:
      // Generally, cannot change critical details if bids have been placed or auction is not 'Upcoming'
      if (auction.bids.length > 0 && (updates.startingBid || updates.product || updates.reservePrice)) {
        return res.status(400).json({ msg: 'Cannot change starting bid, product, or reserve price after bids have been placed.' });
      }
      if (auction.status !== 'Upcoming' && (updates.startTime || updates.endTime || updates.startingBid)) {
          if (auction.bids.length > 0) {
            return res.status(400).json({ msg: 'Cannot change timing or starting bid for an active auction with bids. Consider cancelling and recreating.' });
          }
      }


      // Apply updates
      if (updates.startTime) auction.startTime = new Date(updates.startTime);
      if (updates.endTime) auction.endTime = new Date(updates.endTime);
      if (updates.reservePrice !== undefined) auction.reservePrice = updates.reservePrice;
      if (updates.buyNowPrice !== undefined) auction.buyNowPrice = updates.buyNowPrice;
      // Description or other product details should be updated on the Product model itself.
      // If auction model stores denormalized product info, update here too.

      auction.updateAuctionStatus(); // Recalculate status if times changed
      const updatedAuction = await auction.save();
      await updatedAuction.populate(['product', 'seller', 'currentHighestBidder']);
      res.json(updatedAuction);
    } catch (err) {
      console.error(err.message);
      res.status(500).send('Server Error');
    }
  }
);

// @route   DELETE api/auctions/:id (Cancel Auction)
// @desc    Cancel an auction
// @access  Private (Owner Seller or Admin)
router.delete('/:id', [authMiddleware, updateAuctionStatusMiddleware], async (req, res) => {
    try {
        let auction = req.auction || await Auction.findById(req.params.id);
        if (!auction) {
            return res.status(404).json({ msg: 'Auction not found' });
        }

        // Authorization: Must be seller or admin
        if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'User not authorized to cancel this auction.' });
        }

        // Business logic for cancellation:
        // Can cancel if 'Upcoming'. If 'Active', only if no bids or admin override.
        // Cannot cancel if 'Ended', 'Sold', 'Expired'.
        if (['Ended', 'Sold', 'Expired'].includes(auction.status)) {
            return res.status(400).json({ msg: `Cannot cancel auction with status: ${auction.status}` });
        }
        if (auction.status === 'Active' && auction.bids.length > 0 && req.user.role !== 'admin') {
            return res.status(400).json({ msg: 'Cannot cancel an active auction with bids. Contact admin if necessary.' });
        }

        auction.status = 'Cancelled';
        // Optional: Add a reason for cancellation if needed auction.cancelReason = req.body.reason;
        const cancelledAuction = await auction.save();

        // TODO: Notify bidders if any.
        // Product stock should be "returned" if it was reserved by the auction (not explicitly implemented here)

        res.json({ msg: 'Auction cancelled successfully', auction: cancelledAuction });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// @route   POST api/auctions/:id/process-winner
// @desc    Process auction winner (e.g., create order, notify) - Placeholder
// @access  Private (Admin/System or Seller for their auction)
router.post('/:id/process-winner', [authMiddleware, authorizeRole(['admin', 'seller']), updateAuctionStatusMiddleware], async (req, res) => {
    const auctionId = req.params.id;
    try {
        let auction = req.auction || await Auction.findById(auctionId);
        if (!auction) {
            return res.status(404).json({ msg: 'Auction not found' });
        }

        if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({ msg: 'Not authorized to process this auction.' });
        }

        // Ensure auction has ended and has a winner
        if (auction.status !== 'Ended') {
            return res.status(400).json({ msg: `Auction cannot be processed. Status: ${auction.status}. It must be 'Ended'.` });
        }
        if (!auction.currentHighestBidder) {
            return res.status(400).json({ msg: 'Auction ended with no bids or no winner.' });
        }
         if (auction.reservePrice && auction.currentHighestBid < auction.reservePrice) {
            auction.status = 'Expired'; // Mark as expired if reserve not met
            await auction.save();
            return res.status(400).json({ msg: `Auction reserve price not met. Highest bid: ${auction.currentHighestBid}, Reserve: ${auction.reservePrice}.` });
        }


        // TODO: Implement actual winner processing logic:
        // 1. Create an Order for the winner with the auctioned product and price.
        //    - This could use the existing Order creation logic, adapting it for auction items.
        //    - The order status would initially be 'Pending Payment' or similar.
        // 2. Notify the winner and seller.
        // 3. Update product stock (if not already handled by auction creation).
        // 4. Update auction status to 'Sold' (or 'Awaiting Payment').

        auction.winner = auction.currentHighestBidder;
        auction.status = 'Sold'; // Or 'AwaitingPayment'
        await auction.save();

        // For now, just a success message
        res.json({
            msg: 'Auction winner processed (placeholder). Order creation and notification to be implemented.',
            auctionId: auction._id,
            winnerId: auction.winner,
            productId: auction.product,
            winningBid: auction.currentHighestBid
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// TODO: Cron job endpoint (or separate script) to update statuses of auctions
// router.post('/update-statuses', [authMiddleware, authorizeRole('admin')], async (req, res) => {
// try {
//   await Auction.findActiveAndUpdateStatus();
//   res.json({ msg: 'Auction statuses updated.' });
// } catch (error) {
//   console.error('Error in manual status update:', error);
//   res.status(500).send('Server error during status update.');
// }
// });


module.exports = router;
