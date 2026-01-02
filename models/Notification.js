const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  type: {
    type: String,
    enum: [
      'withdrawal_request',
      'withdrawal_approved',
      'withdrawal_rejected',
      'withdrawal_completed',
      'payment_received',
      'store_approved',
      'store_rejected',
      'system_alert',
      'promotional'
    ],
    required: true
  },
  
  title: {
    type: String,
    required: true,
    trim: true
  },
  
  message: {
    type: String,
    required: true,
    trim: true
  },
  
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  isRead: {
    type: Boolean,
    default: false
  },
  
  readAt: {
    type: Date
  },
  
  priority: {
    type: String,
    enum: ['low', 'medium', 'high'],
    default: 'medium'
  },
  
  expiresAt: {
    type: Date,
    index: { expires: '30d' } // Auto-delete after 30 days
  }
}, {
  timestamps: true
});

// Indexes for better query performance
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });

// Virtual property for formatted date
notificationSchema.virtual('formattedDate').get(function() {
  const now = new Date();
  const diff = Math.floor((now - this.createdAt) / 1000);
  
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  
  return this.createdAt.toLocaleDateString();
});

// Pre-save middleware to set expiration date (30 days from creation)
notificationSchema.pre('save', function(next) {
  if (!this.expiresAt) {
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 30);
    this.expiresAt = expiryDate;
  }
  next();
});

// Static method to create withdrawal notification
notificationSchema.statics.createWithdrawalNotification = function(userId, type, withdrawalData) {
  const notifications = {
    withdrawal_request: {
      title: 'Withdrawal Request Submitted',
      message: `Your withdrawal request for $${withdrawalData.amount} has been submitted for approval.`
    },
    withdrawal_approved: {
      title: 'Withdrawal Approved',
      message: `Your withdrawal of $${withdrawalData.amount} has been approved and is being processed.`
    },
    withdrawal_rejected: {
      title: 'Withdrawal Rejected',
      message: `Your withdrawal request has been rejected. Reason: ${withdrawalData.reason}`
    },
    withdrawal_completed: {
      title: 'Withdrawal Completed',
      message: `Your withdrawal of $${withdrawalData.amount} has been processed successfully.`
    }
  };
  
  return this.create({
    userId,
    type,
    title: notifications[type].title,
    message: notifications[type].message,
    data: withdrawalData,
    priority: type.includes('rejected') ? 'high' : 'medium'
  });
};

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;