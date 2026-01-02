// [file name]: OwnerAuditLog.js
const mongoose = require('mongoose');

const ownerAuditLogSchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'user_suspended', 'user_unsuspended', 'user_edited', 'user_impersonated',
      'store_suspended', 'store_unsuspended', 'store_edited',
      'order_overridden', 'payment_overridden', 'refund_forced',
      'system_setting_changed', 'maintenance_mode_toggled',
      'feature_toggled', 'balance_adjusted', 'commission_changed'
    ]
  },
  targetType: {
    type: String,
    required: true,
    enum: ['user', 'store', 'order', 'payment', 'system', 'feature']
  },
  targetId: mongoose.Schema.Types.ObjectId,
  beforeState: mongoose.Schema.Types.Mixed,
  afterState: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  confirmedBy2FA: {
    type: Boolean,
    default: false
  },
  requiresReview: {
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

// Make logs immutable
ownerAuditLogSchema.pre('save', function(next) {
  if (this.isModified()) {
    return next(new Error('Audit logs are immutable'));
  }
  next();
});

ownerAuditLogSchema.index({ action: 1, timestamp: -1 });
ownerAuditLogSchema.index({ targetType: 1, targetId: 1 });
ownerAuditLogSchema.index({ ownerId: 1, timestamp: -1 });

module.exports = mongoose.model('OwnerAuditLog', ownerAuditLogSchema);