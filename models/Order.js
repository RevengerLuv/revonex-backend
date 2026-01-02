const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  storeId: {
    type: String,
    required: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true
    },
    name: String,
    price: Number,
    quantity: {
      type: Number,
      default: 1
    },
    subtotal: Number,
    
    // Inventory tracking
    inventoryAssigned: {
      type: Boolean,
      default: false
    },
    inventoryItemId: {
      type: mongoose.Schema.Types.ObjectId
    },
    deliveryDetails: {
      credentials: String, // Store encrypted credentials
      deliveredAt: Date,
      deliveryMethod: String,
      downloadUrl: String
    }
  }],
  customer: {
    name: String,
    email: String,
    phone: String
  },
  total: Number,
  
  // NEW: Revenue breakdown for withdrawal calculations
  revenueBreakdown: {
    grossAmount: {
      type: Number,
      required: true
    },
    platformFee: {
      type: Number,
      default: 0
    },
    platformFeePercentage: {
      type: Number,
      default: 20 // 20% Revonex fee
    },
    netAmount: {
      type: Number,
      required: true
    },
    processingFee: {
      type: Number,
      default: 0
    },
    storeEarnings: {
      type: Number,
      required: true
    }
  },
  
  currency: {
    type: String,
    default: 'INR'
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'cancelled', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded'],
    default: 'pending'
  },
  
  // Inventory reservation tracking
  inventoryReserved: {
    type: Boolean,
    default: false
  },
  reservedItems: [{
    productId: mongoose.Schema.Types.ObjectId,
    inventoryItemId: mongoose.Schema.Types.ObjectId,
    reservedAt: Date
  }],
  
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  paymentDetails: {
    method: String,
    transactionId: String,
    gateway: String,
    paymentDate: Date
  },
  notes: String,
  
  // NEW: Withdrawal tracking
  withdrawalProcessed: {
    type: Boolean,
    default: false
  },
  withdrawalReference: {
    type: String
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

orderSchema.pre('validate', function(next) {
  // Ensure revenueBreakdown object exists
  if (!this.revenueBreakdown) {
    this.revenueBreakdown = {};
  }

  if (this.isModified('total') || this.isNew) {
    const platformFeePercentage = this.revenueBreakdown.platformFeePercentage || 20;
    const processingFee = this.revenueBreakdown.processingFee || 0;

    const grossAmount = this.total;
    const platformFee = grossAmount * (platformFeePercentage / 100);
    const storeEarnings = grossAmount - platformFee - processingFee;

    this.revenueBreakdown.grossAmount = grossAmount;
    this.revenueBreakdown.platformFee = platformFee;
    this.revenueBreakdown.platformFeePercentage = platformFeePercentage;
    this.revenueBreakdown.netAmount = grossAmount - platformFee;
    this.revenueBreakdown.processingFee = processingFee;
    this.revenueBreakdown.storeEarnings = storeEarnings;
  }

  // Generate order ID if not present
  if (!this.orderId) {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    this.orderId = `ORD-${year}${month}${day}-${random}`;
  }

  next();
});


// Middleware to update store revenue when order is completed
orderSchema.post('save', async function(doc) {
  try {
    if (doc.status === 'completed' && doc.paymentStatus === 'paid' && !doc.withdrawalProcessed) {
      const Store = mongoose.model('Store');
      
      // Update store revenue
      await Store.findByIdAndUpdate(doc.store, {
        $inc: {
          'analytics.totalSales': 1,
          'analytics.revenue': doc.revenueBreakdown.grossAmount,
          'analytics.totalEarnings': doc.revenueBreakdown.storeEarnings,
          'analytics.netEarnings': doc.revenueBreakdown.storeEarnings,
          'analytics.availableBalance': doc.revenueBreakdown.storeEarnings,
          'revenueBreakdown.grossRevenue': doc.revenueBreakdown.grossAmount,
          'revenueBreakdown.platformFees': doc.revenueBreakdown.platformFee,
          'revenueBreakdown.netRevenue': doc.revenueBreakdown.storeEarnings,
          'revenueBreakdown.availableForWithdrawal': doc.revenueBreakdown.storeEarnings
        }
      });
      
      // Mark as processed for withdrawal
      doc.withdrawalProcessed = true;
      await doc.save();
    }
    
    // If order is cancelled/refunded, deduct from store revenue
    if ((doc.status === 'cancelled' || doc.status === 'refunded') && doc.withdrawalProcessed) {
      const Store = mongoose.model('Store');
      
      await Store.findByIdAndUpdate(doc.store, {
        $inc: {
          'analytics.totalSales': -1,
          'analytics.revenue': -doc.revenueBreakdown.grossAmount,
          'analytics.totalEarnings': -doc.revenueBreakdown.storeEarnings,
          'analytics.netEarnings': -doc.revenueBreakdown.storeEarnings,
          'analytics.availableBalance': -doc.revenueBreakdown.storeEarnings,
          'revenueBreakdown.grossRevenue': -doc.revenueBreakdown.grossAmount,
          'revenueBreakdown.platformFees': -doc.revenueBreakdown.platformFee,
          'revenueBreakdown.netRevenue': -doc.revenueBreakdown.storeEarnings,
          'revenueBreakdown.availableForWithdrawal': -doc.revenueBreakdown.storeEarnings
        }
      });
      
      doc.withdrawalProcessed = false;
      await doc.save();
    }
  } catch (error) {
    console.error('Error updating store revenue:', error);
  }
});

// Method to calculate store earnings for withdrawal
orderSchema.methods.getStoreEarnings = function() {
  return this.revenueBreakdown.storeEarnings;
};

// Method to get platform fee percentage (can be overridden per store)
orderSchema.statics.getPlatformFeePercentage = async function(storeId) {
  const Store = mongoose.model('Store');
  const store = await Store.findById(storeId);
  return store?.analytics?.withdrawalServiceFeePercentage || 20;
};

module.exports = mongoose.model('Order', orderSchema);