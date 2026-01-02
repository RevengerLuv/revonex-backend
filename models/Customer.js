const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    trim: true
  },
  storeId: {
    type: String,
    required: true,
    index: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  lastOrderDate: {
    type: Date
  },
  firstOrderDate: {
    type: Date,
    default: Date.now
  },
  loyaltyLevel: {
    type: String,
    enum: ['New', 'Regular', 'VIP'],
    default: 'New'
  },
  tags: [{
    type: String,
    trim: true
  }],
  notes: {
    type: String,
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for better performance
customerSchema.index({ storeId: 1, email: 1 });
customerSchema.index({ store: 1, createdAt: -1 });

// Virtual for average order value
customerSchema.virtual('avgOrderValue').get(function() {
  return this.totalOrders > 0 ? this.totalSpent / this.totalOrders : 0;
});

// Method to update customer stats
customerSchema.methods.updateStats = async function() {
  const Order = mongoose.model('Order');

  const orders = await Order.find({
    $or: [
      { storeId: this.storeId },
      { store: this.store }
    ],
    'customer.email': this.email,
    status: { $in: ['completed', 'delivered'] },
    paymentStatus: 'paid'
  });

  this.totalOrders = orders.length;
  this.totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0);

  if (orders.length > 0) {
    this.lastOrderDate = orders.sort((a, b) => b.createdAt - a.createdAt)[0].createdAt;
    this.firstOrderDate = orders.sort((a, b) => a.createdAt - b.createdAt)[0].createdAt;
  }

  // Update loyalty level
  if (this.totalOrders >= 10 && this.totalSpent >= 500) {
    this.loyaltyLevel = 'VIP';
  } else if (this.totalOrders >= 3) {
    this.loyaltyLevel = 'Regular';
  } else {
    this.loyaltyLevel = 'New';
  }

  return this.save();
};

module.exports = mongoose.model('Customer', customerSchema);
