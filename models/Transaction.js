const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  transactionId: {
    type: String,
    required: true,
    unique: true
  },
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: false
  },
  orderId: {
    type: String,
    required: true,
    index: true
  },
  store: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true
  },
  customer: {
    name: String,
    email: String,
    phone: String
  },
  amount: {
    type: Number,
    required: true
  },
  currency: {
    type: String,
    default: 'INR'
  },
  gateway: {
    type: String,
    enum: ['razorpay', 'stripe', 'paypal', 'crypto', 'upi', 'nowpayments'],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['card', 'netbanking', 'wallet', 'upi', 'crypto', 'cash_on_delivery']
  },
  status: {
    type: String,
    enum: ['created', 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'],
    default: 'created'
  },
  paymentDetails: {
    razorpay_order_id: String,
    razorpay_payment_id: String,
    razorpay_signature: String,
    upi_id: String,
    crypto_address: String,
    crypto_tx_hash: String,
    card_last4: String,
    bank_name: String,
    // NOWPayments specific fields
    invoice_id: String,
    invoice_url: String,
    payment_id: String,
    pay_currency: String,
    pay_amount: Number,
    actually_paid: Number,
    payout_address: String,
    platform_fee: Number
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed
  },
  refunds: [{
    refundId: String,
    amount: Number,
    reason: String,
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed']
    },
    processedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  isTest: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for faster queries
transactionSchema.index({ orderId: 1 });
transactionSchema.index({ store: 1, createdAt: -1 });
transactionSchema.index({ customer: 1 });
transactionSchema.index({ status: 1 });
transactionSchema.index({ createdAt: -1 });

// Update timestamp before saving
transactionSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;