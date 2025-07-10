const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const OrderItemSchema = new Schema({
  product: {
    type: Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  name: { // Denormalized for historical record keeping
    type: String,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
  },
  price: { // Price at the time of order
    type: Number,
    required: true,
  },
  image: { // Denormalized for easier display in order history
    type: String
  }
});

const OrderSchema = new Schema({
  user: { // Buyer
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  orderItems: [OrderItemSchema],
  shippingAddress: {
    address: { type: String, required: true },
    city: { type: String, required: true },
    postalCode: { type: String, required: true },
    country: { type: String, required: true },
  },
  paymentMethod: { // e.g., 'Stripe', 'PayPal'
    type: String,
    required: true,
  },
  paymentResult: { // Store payment provider's response
    id: { type: String },
    status: { type: String },
    update_time: { type: String },
    email_address: { type: String },
  },
  itemsPrice: { // Subtotal for items
    type: Number,
    required: true,
    default: 0.0,
  },
  taxPrice: {
    type: Number,
    required: true,
    default: 0.0,
  },
  shippingPrice: {
    type: Number,
    required: true,
    default: 0.0,
  },
  totalPrice: { // Grand total
    type: Number,
    required: true,
    default: 0.0,
  },
  orderStatus: {
    type: String,
    required: true,
    enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Payment Failed'],
    default: 'Pending',
  },
  sellerWiseStatus: [ // If you need to track status per seller in a multi-seller order
    {
        sellerId: { type: Schema.Types.ObjectId, ref: 'User'},
        status: { type: String, enum: ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'], default: 'Pending' }
    }
  ],
  isPaid: {
    type: Boolean,
    default: false,
  },
  paidAt: {
    type: Date,
  },
  isDelivered: { // Overall delivery status
    type: Boolean,
    default: false,
  },
  deliveredAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

OrderSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

OrderSchema.index({ user: 1 });
OrderSchema.index({ 'orderItems.product': 1 });
OrderSchema.index({ 'sellerWiseStatus.sellerId': 1 });


module.exports = mongoose.model('Order', OrderSchema);
