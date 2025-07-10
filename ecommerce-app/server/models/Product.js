const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ProductSchema = new Schema({
  seller: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  category: {
    type: String,
    required: true,
    trim: true,
  },
  images: [
    {
      type: String, // URL to the image
      required: false, // Or true if at least one image is mandatory
    },
  ],
  stock: {
    type: Number,
    required: true,
    min: 0,
    default: 0,
  },
  averageRating: { // Optional: Can be calculated based on reviews
    type: Number,
    min: 0,
    max: 5,
    default: 0,
  },
  numReviews: { // Optional
    type: Number,
    default: 0,
  },
  isFeatured: { // Optional
    type: Boolean,
    default: false,
  },
  dateAdded: {
    type: Date,
    default: Date.now,
  },
  lastUpdated: {
    type: Date,
    default: Date.now,
  }
});

// Indexing for faster queries, especially for search/filter
ProductSchema.index({ name: 'text', category: 'text', description: 'text' });
ProductSchema.index({ seller: 1 });
ProductSchema.index({ category: 1 });
ProductSchema.index({ price: 1 });


module.exports = mongoose.model('Product', ProductSchema);
