const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    minlength: [2, 'Name must be at least 2 characters']
  },
  email: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: function() {
      return !this.googleId;
    },
    minlength: [6, 'Password must be at least 6 characters'],
    select: false  // ⚠️ This hides the password by default!
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  avatar: {
    type: String,
    default: ''
  },
  role: {
    type: String,
    enum: ['user', 'store_owner', 'admin', 'owner'],
    default: 'user'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // ========== SUBSCRIPTION FIELD (UPDATED) ==========
  subscription: {
    plan: {
      type: String,
      default: 'free',
      enum: ['free', 'starter', 'pro', 'enterprise']
    },
    planName: {
      type: String,
      default: 'Free'
    },
    price: {
      type: Number,
      default: 0
    },
    basePrice: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'cancelled', 'pending', 'past_due'],
      default: 'active'
    },
    startDate: {
      type: Date,
      default: Date.now
    },
    endDate: {
      type: Date,
      default: function() {
        const date = new Date(this.startDate || Date.now());
        date.setMonth(date.getMonth() + 1);
        return date;
      }
    },
    endTimestamp: {
      type: Number,
      default: function() {
        const date = new Date(this.startDate || Date.now());
        date.setMonth(date.getMonth() + 1);
        return date.getTime();
      }
    },
    billingCycle: {
      type: String,
      default: 'monthly',
      enum: ['monthly', 'yearly', 'custom']
    },
    validityMonths: {
      type: Number,
      default: 1,
      min: 1,
      max: 24
    },
    durationMonths: {
      type: Number,
      default: 1,
      min: 1,
      max: 24
    },
    totalDays: {
      type: Number,
      default: 30
    },
    monthlyPrice: {
      type: Number,
      default: 0
    },
    discount: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    razorpayPaymentId: {
      type: String,
      default: null
    },
    razorpayOrderId: {
      type: String,
      default: null
    },
    transactionId: {
      type: String,
      default: ''
    },
    features: {
      type: [String],
      default: function() {
        // Default features based on plan
        const planFeatures = {
          'free': [
            'Up to 18 products',
            'Manage up to 5 stores',
            'Community support',
            'Basic store analytics',
            'Manual order delivery'
          ],
          'starter': [
            'Up to 30 products',
            'Run 15 Fully-Managed Stores',
            'Standard support',
            'Custom Sub-domain',
            'Standard themes',
            'Expert Analytics Dashboard',
            'Secure & Optimized Checkout'
          ],
          'pro': [
            'Unlock 50 Premium Products',
            'Custom Domain',
            'Manage up to 30 stores',
            'Advanced Analytics Dashboard',
            '0% Transaction Fee',
            'Unlimited Customer Queries',
            'Fully automated delivery'
          ],
          'enterprise': [
            'Unlock 80 Premium Products',
            'Enterprise analytics dashboard',
            'Manage up to 50 stores',
            'Custom Domain',
            '0% Transaction Fee',
            'Dedicated Priority Support',
            'Super Fast & High Performance Store'
          ]
        };
        return planFeatures[this.plan] || planFeatures['free'];
      }
    },
    cancelledAt: {
      type: Date,
      default: null
    },
    downgradedAt: {
      type: Date,
      default: null
    },
    upgradedAt: {
      type: Date,
      default: null
    },
    lastUpdated: {
      type: Date,
      default: Date.now
    }
  },
  lastSubscriptionUpdate: {
    type: Date,
    default: Date.now
  },
  
  // ========== BAN MANAGEMENT ==========
  isBanned: {
    type: Boolean,
    default: false
  },
  banReason: String,
  bannedAt: Date,
  bannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  unbanReason: String,
  unbannedAt: Date,
  unbannedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // ========== VERIFICATION ==========
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // ========== SECURITY ==========
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: String,
  twoFactorBackupCodes: [String],
  
  // ========== ACTIVITY TRACKING ==========
  lastLogin: Date,
  lastActive: Date,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  
  // ========== STATISTICS ==========
  stats: {
    stores: {
      type: Number,
      default: 0
    },
    storesLimit: {
      type: Number,
      default: function() {
        // Default store limits based on subscription plan
        const limits = {
          'free': 5,
          'starter': 15,
          'pro': 30,
          'enterprise': 50
        };
        return limits[this.parent().subscription?.plan] || 5;
      }
    },
    products: {
      type: Number,
      default: 0
    },
    productsLimit: {
      type: Number,
      default: function() {
        // Default product limits based on subscription plan
        const limits = {
          'free': 18,
          'starter': 30,
          'pro': 50,
          'enterprise': 80
        };
        return limits[this.parent().subscription?.plan] || 18;
      }
    },
    orders: {
      type: Number,
      default: 0
    },
    totalSpent: {
      type: Number,
      default: 0
    },
    totalEarned: {
      type: Number,
      default: 0
    }
  },
  
  // ========== PREFERENCES ==========
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    timezone: {
      type: String,
      default: 'UTC'
    },
    currency: {
      type: String,
      default: 'INR'
    },
    notifications: {
      email: {
        type: Boolean,
        default: true
      },
      push: {
        type: Boolean,
        default: true
      },
      marketing: {
        type: Boolean,
        default: false
      }
    },
    theme: {
      type: String,
      default: 'light',
      enum: ['light', 'dark', 'system']
    }
  },
  
  // ========== BUSINESS INFO ==========
  business: {
    name: String,
    address: String,
    city: String,
    state: String,
    zipCode: String,
    country: String,
    taxId: String,
    website: String,
    phone: String,
    businessType: String,
    registrationNumber: String
  },
  
  // ========== PAYMENT INFO ==========
  payment: {
    defaultCard: String,
    cards: [{
      last4: String,
      brand: String,
      expMonth: Number,
      expYear: Number,
      isDefault: Boolean,
      addedAt: Date
    }],
    billingAddress: {
      line1: String,
      line2: String,
      city: String,
      state: String,
      zipCode: String,
      country: String
    }
  },
  
  // ========== SOCIAL PROFILES ==========
  socialProfiles: {
    facebook: String,
    twitter: String,
    linkedin: String,
    instagram: String,
    youtube: String
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ========== VIRTUAL FIELDS ==========
userSchema.virtual('isSubscriptionActive').get(function() {
  if (!this.subscription) return false;
  
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  
  return this.subscription.status === 'active' && now <= endDate;
});

userSchema.virtual('subscriptionDaysRemaining').get(function() {
  if (!this.subscription || !this.subscription.endDate) return 0;
  
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  const diffMs = endDate.getTime() - now.getTime();
  
  if (diffMs <= 0) return 0;
  
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
});

userSchema.virtual('subscriptionProgress').get(function() {
  if (!this.subscription || !this.subscription.startDate || !this.subscription.endDate) return 0;
  
  const startDate = new Date(this.subscription.startDate);
  const endDate = new Date(this.subscription.endDate);
  const now = new Date();
  
  const totalMs = endDate.getTime() - startDate.getTime();
  const elapsedMs = now.getTime() - startDate.getTime();
  
  if (totalMs <= 0 || elapsedMs <= 0) return 0;
  if (elapsedMs >= totalMs) return 100;
  
  return Math.round((elapsedMs / totalMs) * 100);
});

userSchema.virtual('subscriptionPlanLevel').get(function() {
  const planLevels = {
    'free': 0,
    'starter': 1,
    'pro': 2,
    'enterprise': 3
  };
  
  return planLevels[this.subscription?.plan] || 0;
});

// ========== MIDDLEWARE ==========
// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Auto-update subscription stats when plan changes
userSchema.pre('save', function(next) {
  if (this.isModified('subscription.plan')) {
    // Update store and product limits based on new plan
    const limits = {
      'free': { stores: 5, products: 18 },
      'starter': { stores: 15, products: 30 },
      'pro': { stores: 30, products: 50 },
      'enterprise': { stores: 50, products: 80 }
    };
    
    const newLimits = limits[this.subscription.plan] || limits.free;
    this.stats.storesLimit = newLimits.stores;
    this.stats.productsLimit = newLimits.products;
    
    // Update subscription features
    const planFeatures = {
      'free': [
        'Up to 18 products',
        'Manage up to 5 stores',
        'Community support',
        'Basic store analytics',
        'Manual order delivery'
      ],
      'starter': [
        'Up to 30 products',
        'Run 15 Fully-Managed Stores',
        'Standard support',
        'Custom Sub-domain',
        'Standard themes'
      ],
      'pro': [
        'Unlock 50 Premium Products',
        'Custom Domain',
        'Manage up to 30 stores',
        'Advanced Analytics Dashboard',
        '0% Transaction Fee'
      ],
      'enterprise': [
        'Unlock 80 Premium Products',
        'Enterprise analytics dashboard',
        'Manage up to 50 stores',
        'Custom Domain',
        '0% Transaction Fee'
      ]
    };
    
    this.subscription.features = planFeatures[this.subscription.plan] || planFeatures.free;
    this.subscription.lastUpdated = new Date();
    this.lastSubscriptionUpdate = new Date();
  }
  
  next();
});

// ========== INSTANCE METHODS ==========
// Compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate email verification token
userSchema.methods.generateEmailVerificationToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  return token;
};

// Generate password reset token
userSchema.methods.generatePasswordResetToken = function() {
  const token = crypto.randomBytes(32).toString('hex');
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  this.passwordResetExpires = Date.now() + 1 * 60 * 60 * 1000; // 1 hour
  return token;
};

// Generate JWT token
userSchema.methods.generateAuthToken = function() {
  return jwt.sign(
    { 
      id: this._id,
      email: this.email,
      role: this.role,
      subscription: this.subscription
    },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '7d' }
  );
};

// Check if subscription is active
userSchema.methods.hasActiveSubscription = function() {
  if (!this.subscription) return false;
  
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  
  return this.subscription.status === 'active' && now <= endDate;
};

// Check if user can access feature based on subscription
userSchema.methods.canAccessFeature = function(feature) {
  if (!this.subscription) return false;
  
  const featureRequirements = {
    'custom_domain': ['pro', 'enterprise'],
    'multiple_stores': ['starter', 'pro', 'enterprise'],
    'advanced_analytics': ['pro', 'enterprise'],
    'automated_delivery': ['pro', 'enterprise'],
    'priority_support': ['pro', 'enterprise'],
    'enterprise_features': ['enterprise']
  };
  
  const requiredPlan = featureRequirements[feature];
  if (!requiredPlan) return true; // Feature doesn't require specific plan
  
  return requiredPlan.includes(this.subscription.plan);
};

// Get subscription summary
userSchema.methods.getSubscriptionSummary = function() {
  if (!this.subscription) {
    return {
      plan: 'free',
      planName: 'Free',
      isActive: false,
      daysRemaining: 0,
      status: 'inactive'
    };
  }
  
  const now = new Date();
  const endDate = new Date(this.subscription.endDate);
  const diffMs = endDate.getTime() - now.getTime();
  const daysRemaining = diffMs > 0 ? Math.ceil(diffMs / (1000 * 60 * 60 * 24)) : 0;
  
  return {
    plan: this.subscription.plan,
    planName: this.subscription.planName,
    isActive: this.subscription.status === 'active' && now <= endDate,
    daysRemaining: daysRemaining,
    status: this.subscription.status,
    endDate: this.subscription.endDate,
    startDate: this.subscription.startDate,
    price: this.subscription.price,
    monthlyPrice: this.subscription.monthlyPrice,
    discount: this.subscription.discount,
    validityMonths: this.subscription.validityMonths,
    totalDays: this.subscription.totalDays,
    features: this.subscription.features
  };
};

// ========== STATIC METHODS ==========
// Find users with expired subscriptions
userSchema.statics.findExpiredSubscriptions = function() {
  const now = new Date();
  return this.find({
    'subscription.status': 'active',
    'subscription.endDate': { $lt: now }
  });
};

// Update expired subscriptions
userSchema.statics.updateExpiredSubscriptions = async function() {
  const expiredUsers = await this.findExpiredSubscriptions();
  
  for (const user of expiredUsers) {
    user.subscription.status = 'expired';
    await user.save();
    console.log(`Updated expired subscription for user: ${user.email}`);
  }
  
  return expiredUsers.length;
};

// Find users by subscription plan
userSchema.statics.findBySubscriptionPlan = function(plan) {
  return this.find({ 'subscription.plan': plan });
};

module.exports = mongoose.model('User', userSchema);