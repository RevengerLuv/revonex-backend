// server/models/DomainOrder.js
const mongoose = require('mongoose');

const domainOrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  paymentId: String,
  domain: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  amount: {
    type: Number,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store'
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  setupComplete: {
    type: Boolean,
    default: false
  },
  setupCompletedAt: Date,
  setupNotes: String,
  pricing: {
    domainPrice: Number,
    setupFee: Number,
    gst: Number,
    total: Number
  },
  paidAt: Date,
  expiresAt: Date,
  metadata: Object
}, {
  timestamps: true
});

// Indexes for faster queries
domainOrderSchema.index({ userId: 1, status: 1 });
domainOrderSchema.index({ domain: 1 });
domainOrderSchema.index({ orderId: 1 });
domainOrderSchema.index({ status: 1, setupComplete: 1 });

module.exports = mongoose.model('DomainOrder', domainOrderSchema);