const mongoose = require('mongoose');

const storeSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  storeName: {
    type: String,
    required: true,
    trim: true
  },
  storeSlug: {
    type: String,
    required: true,
    unique: true
  },
  storeType: {  // ADD THIS FIELD - it's being sent from frontend
    type: String,
    default: 'digital',
    enum: ['digital', 'physical', 'service']
  },
  template: {
    type: String,
    enum: ['modern', 'elegant', 'bold', 'dark', 'storefront', 'portfolio'],
    default: 'modern'
  },
  logo: {
    type: String,
    default: ''
  },
  banner: {
    type: String,
    default: ''
  },
  description: {
    type: String,
    default: ''
  },
  shortDescription: {
    type: String,
    default: ''
  },
  theme: {
    primaryColor: {
      type: String,
      default: '#3B82F6'
    },
    secondaryColor: {
      type: String,
      default: '#1E40AF'
    },
    fontFamily: {
      type: String,
      default: 'Inter'
    }
  },
  customDomain: {
    type: String
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['admin', 'editor', 'viewer'],
      default: 'viewer'
    }
  }],
  contactEmail: {
    type: String,
    required: true
  },
  socialLinks: {
    facebook: String,
    twitter: String,
    instagram: String,
    linkedin: String,
    youtube: String
  },
  settings: {
    currency: {
      type: String,
      default: 'INR'
    },
    language: {
      type: String,
      default: 'en'
    },
    autoDigitalDelivery: {
      type: Boolean,
      default: true
    },
    requireLoginToPurchase: {
      type: Boolean,
      default: false
    }
  },
  withdrawalInfo: {
    fullName: String,
    phone: String,
    address: String,
    upiId: String,
    bankAccount: String,
    ifscCode: String,
    bankName: String,
    updatedAt: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBanned: {
    type: Boolean,
    default: false
  },
  analytics: {
    totalViews: {
      type: Number,
      default: 0
    },
    totalSales: {
      type: Number,
      default: 0
    },
    revenue: {
      type: Number,
      default: 0
    }
  },
  balance: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  cryptoWallet: {
    type: String,
    default: '',
    trim: true
  },
  cryptoPaymentEnabled: {
    type: Boolean,
    default: false
  },
  preferredCryptoCurrency: {
    type: String,
    default: 'btc',
    enum: ['btc', 'eth', 'usdt', 'usdc', 'bnb', 'sol']
  },
  paymentMethods: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Add index for faster queries
storeSchema.index({ owner: 1, isActive: 1 });
storeSchema.index({ storeSlug: 1 }, { unique: true });

const Store = mongoose.model('Store', storeSchema);
module.exports = Store;