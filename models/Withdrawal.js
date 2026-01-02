const mongoose = require('mongoose');

const withdrawalSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  storeName: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  // Add these to your withdrawalSchema in Withdrawal.js:
revenueDeducted: {
  type: Number,
  default: 0
},
previousRevenue: Number,
newRevenue: Number,
deductionTimestamp: {
  type: Date,
  default: Date.now
},
  serviceFee: {
    type: Number,
    default: 0,
    min: 0
  },
  serviceFeeRate: {
    type: Number,
    default: 20 // 20% for non-PRO, 0% for PRO
  },
  netAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMethod: {
    type: String,
    enum: ['upi', 'bank'],
    required: true
  },
  // Payment details based on method
  upiId: String,
  bankAccount: String,
  ifscCode: String,
  bankName: String,
  
  // Recipient details
  recipientDetails: {
    fullName: {
      type: String,
      required: true
    },
    phone: {
      type: String,
      required: true
    },
    address: String,
    email: String
  },
  
  notes: String,
  
  // Status workflow: pending → approved → completed OR rejected
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'],
    default: 'pending'
  },
  
  // Approval/Rejection details
  approvedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectedAt: Date,
  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  rejectionReason: String,
  
  // Completion details (when owner marks as paid)
  completedAt: Date,
  completedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ownerTransactionId: String, // Owner's payment reference
  
  // Transaction tracking
  transactionId: {
    type: String,
    unique: true,
    default: () => `WDR${Date.now()}${Math.random().toString(36).substr(2, 9)}`
  }
}, {
  timestamps: true
});

// Indexes
withdrawalSchema.index({ userId: 1, status: 1 });
withdrawalSchema.index({ status: 1 });
withdrawalSchema.index({ createdAt: -1 });
withdrawalSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);