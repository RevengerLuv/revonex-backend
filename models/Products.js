const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  slug: {
    type: String,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  shortDescription: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    required: true
  },
  comparePrice: {
    type: Number
  },
  cost: {
    type: Number
  },
  sku: {
    type: String
  },
  barcode: {
    type: String
  },
  variants: [{
    variantId: String,
    name: String,
    price: Number,
    comparePrice: Number,
    sku: String,
    stock: Number,
    options: [String]
  }],
  categories: {
    type: [String],
    default: []
  },
  tags: {
    type: [String],
    default: []
  },
  images: [{
    type: String
  }],
  type: {
    type: String,
    enum: ['digital', 'physical', 'service', 'subscription'],
    default: 'digital'
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'inactive', 'archived'],
    default: 'draft'
  },
  visibility: {
    type: String,
    enum: ['public', 'private', 'unlisted'],
    default: 'public'
  },
  stock: {
    type: Number,
    default: 0
  },
  lowStockThreshold: {
    type: Number,
    default: 10
  },
  weight: {
    type: Number
  },
  dimensions: {
    length: Number,
    width: Number,
    height: Number
  },
  seo: {
    title: String,
    description: String,
    keywords: [String]
  },
  customFields: [{
    label: String,
    type: String,
    value: String,
    required: Boolean
  }],
  meta: {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    updatedAt: {
      type: Date,
      default: Date.now
    }
  },
  // Inventory management for digital products
  inventoryType: {
    type: String,
    enum: ['none', 'manual', 'auto'],
    default: 'none'
  },
  inventory: {
    items: [{
      details: String,
      status: {
        type: String,
        enum: ['available', 'sold', 'reserved'],
        default: 'available'
      },
      soldAt: Date,
      orderId: String,
      notes: String,
      createdAt: {
        type: Date,
        default: Date.now
      }
    }],
    stockCount: {
      type: Number,
      default: 0
    },
    soldCount: {
      type: Number,
      default: 0
    }
  },
  views: {
    type: Number,
    default: 0
  },
  salesCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
});

module.exports = mongoose.model('Product', productSchema);