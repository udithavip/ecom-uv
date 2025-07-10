const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BidSchema = new Schema({
  user: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

const AuctionSchema = new Schema({
  product: { // The product being auctioned
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
    unique: true, // One active auction per product at a time
  },
  seller: { // Denormalize seller for easier query, same as product.seller
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  startingBid: {
    type: Number,
    required: true,
    min: 0.01, // Bids must be positive
  },
  currentHighestBid: {
    type: Number,
    default: function() { return this.startingBid; } // Initially the starting bid or null if no bids yet and you prefer that
  },
  currentHighestBidder: { // User who placed the current highest bid
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  bids: [BidSchema], // History of all bids
  status: {
    type: String,
    enum: ['Pending', 'Upcoming', 'Active', 'Ended', 'Sold', 'Expired', 'Cancelled'],
    // Pending: Admin approval needed if that's a feature
    // Upcoming: Approved, but start time is in the future
    // Active: Start time has passed, end time is in the future
    // Ended: End time has passed, awaiting processing (e.g. winner notification, order creation)
    // Sold: Ended and winner has "paid" or order created
    // Expired: Ended with no bids, or highest bid didn't meet reserve (if reserve price is added)
    // Cancelled: Auction cancelled by seller/admin before ending
    default: 'Upcoming',
  },
  winner: { // Final winner after auction ends and processed
    type: Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  reservePrice: { // Optional: Minimum price the item will sell for
    type: Number,
    min: 0,
  },
  buyNowPrice: { // Optional: Allow users to buy immediately
      type: Number,
      min: 0,
  },
  viewCount: {
      type: Number,
      default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  }
});

AuctionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  // Ensure currentHighestBid is at least startingBid
  if (this.currentHighestBid < this.startingBid && this.bids.length === 0) {
      this.currentHighestBid = this.startingBid;
  }
  next();
});

// Indexing
AuctionSchema.index({ product: 1 });
AuctionSchema.index({ seller: 1 });
AuctionSchema.index({ status: 1 });
AuctionSchema.index({ endTime: 1 }); // Important for querying active/ended auctions

// Method to update auction status based on time
AuctionSchema.methods.updateAuctionStatus = function() {
    const now = new Date();
    if (this.status === 'Cancelled' || this.status === 'Sold' || this.status === 'Expired') {
        // Don't change status if already in a final state
        return;
    }

    if (now < this.startTime) {
        this.status = 'Upcoming';
    } else if (now >= this.startTime && now < this.endTime) {
        this.status = 'Active';
    } else if (now >= this.endTime) {
        // If it ended and there's a valid highest bidder (and reserve met, if applicable)
        if (this.currentHighestBidder && this.currentHighestBid >= (this.reservePrice || 0) ) {
            // This status might be temporary until an order is created or payment confirmed.
            // 'Ended' could signify "awaiting winner action" or "awaiting processing".
            this.status = 'Ended';
        } else {
            this.status = 'Expired'; // No bids, or reserve not met
        }
    }
};


// Static method to find and update status of auctions (e.g., for a cron job)
AuctionSchema.statics.findActiveAndUpdateStatus = async function() {
    const auctionsToUpdate = await this.find({
        status: { $in: ['Upcoming', 'Active'] },
        endTime: { $lte: new Date() } // Find auctions whose end time has passed
    });

    for (const auction of auctionsToUpdate) {
        auction.updateAuctionStatus(); // Use the instance method
        if (auction.status === 'Ended' && auction.currentHighestBidder) {
            // Additional logic: e.g., notify winner, create an order placeholder
            console.log(`Auction ${auction._id} for product ${auction.product} has ended. Winner: ${auction.currentHighestBidder} with bid ${auction.currentHighestBid}`);
            // Here you could emit an event, or directly create a preliminary order/notification.
            // For now, just updating status. Winner processing will be a separate step.
            auction.winner = auction.currentHighestBidder;
        } else if (auction.status === 'Expired') {
             console.log(`Auction ${auction._id} for product ${auction.product} has expired without a qualifying bid.`);
        }
        await auction.save();
    }
};


module.exports = mongoose.model('Auction', AuctionSchema);
