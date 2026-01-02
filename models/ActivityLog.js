// [file name]: ActivityLog.js
const mongoose = require('mongoose');

const activityLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  userRole: {
    type: String,
    enum: ['user', 'store_owner', 'admin', 'owner'],
    required: true
  },
  userEmail: String,
  action: {
    type: String,
    required: true,
    index: true
  },
  entityType: {
    type: String,
    enum: ['user', 'store', 'product', 'order', 'payment', 'analytics', 'system'],
    index: true
  },
  entityId: mongoose.Schema.Types.ObjectId,
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    index: true
  },
  sessionId: String,
  ipAddress: String,
  userAgent: String,
  deviceInfo: {
    type: String,
    enum: ['desktop', 'mobile', 'tablet', 'unknown']
  },
  location: {
    country: String,
    city: String,
    region: String
  },
  metadata: mongoose.Schema.Types.Mixed,
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  isSuspicious: {
    type: Boolean,
    default: false
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for fast queries
activityLogSchema.index({ timestamp: -1 });
activityLogSchema.index({ userId: 1, timestamp: -1 });
activityLogSchema.index({ storeId: 1, timestamp: -1 });
activityLogSchema.index({ action: 1, timestamp: -1 });
activityLogSchema.index({ riskScore: -1, timestamp: -1 });
activityLogSchema.index({ isSuspicious: 1, timestamp: -1 });

module.exports = mongoose.model('ActivityLog', activityLogSchema);