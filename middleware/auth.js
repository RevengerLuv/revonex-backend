// server/middleware/auth.js - COMPLETE VERSION
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Store = require('../models/Store');

// server/middleware/auth.js - FIXED VERSION

const auth = async (req, res, next) => {
  // Skip auth for login, register, and other public routes
  const publicPaths = [
    '/api/auth/login', 
    '/api/auth/register', 
    '/api/auth/forgot-password', 
    '/api/auth/reset-password',
    '/api/auth/debug-login',
    '/api/auth/refresh-token'  // Add this too
  ];
  
  console.log('🔐 Auth middleware checking path:', req.path);
  
  if (publicPaths.some(path => req.path.startsWith(path))) {
    console.log('🟢 Skipping auth for public path:', req.path);
    return next();
  }
  
  try {
    let token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Also check cookies for token
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }
    
    console.log('🔑 Token present:', token ? 'Yes (length: ' + token.length + ')' : 'No');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'No authentication token, access denied' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'test-secret-123');
    
    console.log('🔍 Token decoded:', decoded);
    
    // Handle different JWT payload structures
    let userId;
    if (decoded.userId) {
      userId = decoded.userId;  // This is what your authController generates
    } else if (decoded.user && decoded.user.id) {
      userId = decoded.user.id;
    } else if (decoded.id) {
      userId = decoded.id;
    } else {
      userId = decoded.user;
    }

    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format' 
      });
    }

    const user = await User.findById(userId).select('+subscription');
    
    if (!user) {
      return res.status(401).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    if (user.isBanned) {
      const banMessage = user.banReason
        ? `Your account has been banned. Reason: ${user.banReason}`
        : 'Your Account is banned. If you believe this is a mistake, please contact support.';

      return res.status(403).json({
        success: false,
        error: banMessage,
        banReason: user.banReason,
        bannedAt: user.bannedAt,
        banExpiresAt: user.banExpiresAt
      });
    }

    if (!user.isActive) {
      return res.status(403).json({ 
        success: false,
        error: 'Account is deactivated' 
      });
    }

    req.user = user;
    req.userId = user._id;
    req.userRole = user.role;
    req.token = token;
    
    console.log('✅ User authenticated:', user.email);
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        error: 'Token expired. Please login again.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      error: 'Authentication failed: ' + error.message
    });
  }
};

// Check if user owns the store (for withdrawal operations)
const isStoreOwner = async (req, res, next) => {
  try {
    const storeId = req.params.storeId || req.query.storeId || req.body.storeId;
    
    if (!storeId) {
      return res.status(400).json({ 
        success: false,
        error: 'Store ID is required' 
      });
    }

    const store = await Store.findById(storeId);

    if (!store) {
      return res.status(404).json({ 
        success: false,
        error: 'Store not found' 
      });
    }

    // Allow owners to access all stores
    if (req.user.role === 'owner') {
      req.store = store;
      return next();
    }

    // Check if user is the store owner
    if (store.owner.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        error: 'You are not authorized to access this store' 
      });
    }

    // Check if store has withdrawal enabled
    if (store.withdrawalSettings && !store.withdrawalSettings.isEnabled) {
      return res.status(403).json({ 
        success: false,
        error: 'Withdrawals are disabled for this store' 
      });
    }

    req.store = store;
    next();
  } catch (error) {
    console.error('Store owner check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

const isAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'admin' || req.user.role === 'owner')) {
    return next();
  }
  return res.status(403).json({ 
    success: false,
    error: 'Admin access required' 
  });
};

const isOwner = (req, res, next) => {
  if (req.user && req.user.role === 'owner') {
    return next();
  }
  return res.status(403).json({ 
    success: false,
    error: 'Owner access required' 
  });
};

const isOwnerOrAdmin = (req, res, next) => {
  if (req.user && (req.user.role === 'owner' || req.user.role === 'admin')) {
    return next();
  }
  return res.status(403).json({ 
    success: false,
    error: 'Owner or admin access required' 
  });
};

// Withdrawal-specific middleware
const canWithdraw = async (req, res, next) => {
  try {
    const storeId = req.params.storeId || req.query.storeId || req.body.storeId;
    
    if (!storeId) {
      return res.status(400).json({ 
        success: false,
        error: 'Store ID is required' 
      });
    }

    const store = await Store.findById(storeId);
    
    if (!store) {
      return res.status(404).json({ 
        success: false,
        error: 'Store not found' 
      });
    }

    // Check ownership
    if (store.owner.toString() !== req.user.id && req.user.role !== 'owner') {
      return res.status(403).json({ 
        success: false,
        error: 'Not authorized to withdraw from this store' 
      });
    }

    // Check withdrawal settings
    if (!store.withdrawalSettings?.isEnabled) {
      return res.status(403).json({ 
        success: false,
        error: 'Withdrawals are disabled for this store' 
      });
    }

    // Check minimum balance
    const minWithdrawal = store.withdrawalSettings?.minimumWithdrawal || 10;
    const availableBalance = store.analytics?.availableBalance || 0;
    
    if (availableBalance < minWithdrawal) {
      return res.status(400).json({ 
        success: false,
        error: `Minimum withdrawal amount is $${minWithdrawal}. Available: $${availableBalance.toFixed(2)}` 
      });
    }

    req.store = store;
    next();
  } catch (error) {
    console.error('Withdrawal permission error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Check withdrawal limits
const checkWithdrawalLimits = async (req, res, next) => {
  try {
    const storeId = req.params.storeId || req.query.storeId || req.body.storeId;
    const amount = parseFloat(req.body.amount) || parseFloat(req.query.amount);
    
    if (!storeId || !amount) {
      return res.status(400).json({ 
        success: false,
        error: 'Store ID and amount are required' 
      });
    }

    const store = await Store.findById(storeId);
    
    if (!store) {
      return res.status(404).json({ 
        success: false,
        error: 'Store not found' 
      });
    }

    // Get withdrawal limits
    const limits = store.withdrawalSettings?.withdrawalLimits || {};
    const dailyLimit = limits.daily || 5000;
    const weeklyLimit = limits.weekly || 20000;
    const monthlyLimit = limits.monthly || 50000;

    // Check amount against limits
    if (amount > dailyLimit) {
      return res.status(400).json({ 
        success: false,
        error: `Amount exceeds daily withdrawal limit of $${dailyLimit}` 
      });
    }

    // Check if store has reached weekly/monthly limits
    // You would need to query withdrawal history here
    // For now, we'll just check against available balance
    const availableBalance = store.analytics?.availableBalance || 0;
    
    if (amount > availableBalance) {
      return res.status(400).json({ 
        success: false,
        error: `Insufficient balance. Available: $${availableBalance.toFixed(2)}` 
      });
    }

    req.store = store;
    req.withdrawalAmount = amount;
    next();
  } catch (error) {
    console.error('Withdrawal limit check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// KYC verification middleware
const requireKYC = (req, res, next) => {
  if (!req.user.kycStatus || req.user.kycStatus !== 'verified') {
    return res.status(403).json({ 
      success: false,
      error: 'KYC verification required for withdrawals' 
    });
  }
  next();
};

// Check store has valid withdrawal info
const hasWithdrawalInfo = async (req, res, next) => {
  try {
    const storeId = req.params.storeId || req.query.storeId || req.body.storeId;
    
    if (!storeId) {
      return res.status(400).json({ 
        success: false,
        error: 'Store ID is required' 
      });
    }

    const store = await Store.findById(storeId);
    
    if (!store) {
      return res.status(404).json({ 
        success: false,
        error: 'Store not found' 
      });
    }

    // Check if store has owner details for withdrawal
    if (!store.ownerDetails || !store.ownerDetails.fullName || !store.ownerDetails.phone) {
      return res.status(400).json({ 
        success: false,
        error: 'Store owner details are required. Please update your profile.' 
      });
    }

    // Check payment method details
    const hasUPI = store.withdrawalSettings?.upiDetails?.upiId;
    const hasBank = store.withdrawalSettings?.bankDetails?.accountNumber;
    
    if (!hasUPI && !hasBank) {
      return res.status(400).json({ 
        success: false,
        error: 'Payment method is required. Please add UPI or bank details.' 
      });
    }

    req.store = store;
    next();
  } catch (error) {
    console.error('Withdrawal info check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
};

// Placeholder 2FA middleware used by master owner routes.
const require2FA = (req, res, next) => {
  // In production, replace this with actual 2FA verification logic
  // For now, we'll skip 2FA for development
  console.log('2FA check bypassed for development');
  return next();
};

module.exports = {
  auth,
  isStoreOwner,
  isAdmin,
  isOwner,
  isOwnerOrAdmin,
  canWithdraw,
  checkWithdrawalLimits,
  requireKYC,
  hasWithdrawalInfo,
  require2FA,
};