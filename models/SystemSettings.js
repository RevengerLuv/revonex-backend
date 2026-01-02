// [file name]: SystemSettings.js
const mongoose = require('mongoose');

const systemSettingsSchema = new mongoose.Schema({
  // Platform Features
  features: {
    registration: {
      enabled: { type: Boolean, default: true },
      requireEmailVerification: { type: Boolean, default: true }
    },
    storeCreation: {
      enabled: { type: Boolean, default: true },
      maxStoresPerUser: { type: Number, default: 3 }
    },
    payments: {
      enabled: { type: Boolean, default: true },
      allowedGateways: [{
        name: String,
        enabled: Boolean,
        maintenanceMode: Boolean
      }]
    },
    withdrawals: {
      enabled: { type: Boolean, default: true },
      minAmount: { type: Number, default: 10 },
      maxAmount: { type: Number, default: 10000 }
    },
    api: {
      enabled: { type: Boolean, default: true },
      rateLimitPerMinute: { type: Number, default: 60 }
    }
  },
  
  // Financial Settings
  financial: {
    platformFeePercentage: { type: Number, default: 5, min: 0, max: 50 },
    commissionPercentage: { type: Number, default: 10, min: 0, max: 50 },
    minimumOrderValue: { type: Number, default: 1 },
    currency: { type: String, default: 'INR' },
    taxRate: { type: Number, default: 0 }
  },
  
  // Security Settings
  security: {
    require2FAForOwners: { type: Boolean, default: true },
    sessionTimeoutMinutes: { type: Number, default: 120 },
    maxLoginAttempts: { type: Number, default: 5 },
    suspiciousActivityAlerts: { type: Boolean, default: true },
    ipWhitelist: [String],
    ipBlacklist: [String]
  },
  
  // System Status
  system: {
    maintenanceMode: {
      enabled: { type: Boolean, default: false },
      message: String,
      estimatedRestoreTime: Date
    },
    emergencyShutdown: {
      enabled: { type: Boolean, default: false },
      reason: String,
      initiatedAt: Date
    },
    performanceMode: {
      enabled: { type: Boolean, default: false },
      reducedLogging: Boolean
    }
  },
  
  // Analytics & Monitoring
  monitoring: {
    realtimeDashboard: { type: Boolean, default: true },
    alertThresholds: {
      highRevenueChange: { type: Number, default: 50 }, // % change
      failedPaymentRate: { type: Number, default: 30 }, // %
      suspiciousLoginRate: { type: Number, default: 10 } // %
    }
  },
  
  // Override Settings (store-specific overrides)
  storeOverrides: [{
    storeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Store' },
    settings: mongoose.Schema.Types.Mixed,
    expiresAt: Date,
    reason: String
  }],
  
  // Last Updated
  lastUpdatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  lastUpdatedAt: {
    type: Date,
    default: Date.now
  },
  version: {
    type: Number,
    default: 1
  }
}, {
  timestamps: true
});

// Ensure single document
systemSettingsSchema.statics.getSettings = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

module.exports = mongoose.model('SystemSettings', systemSettingsSchema);