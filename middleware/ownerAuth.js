// [file name]: ownerAuth.js
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const OwnerAuditLog = require('../models/OwnerAuditLog');

// Absolute owner-only middleware
const ownerOnly = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // ONLY owner role can access
    if (user.role !== 'owner') {
      return res.status(403).json({ 
        success: false, 
        error: 'Owner access required' 
      });
    }
    
    // Check if owner account is active
    if (user.isBanned || !user.isActive) {
      return res.status(403).json({ 
        success: false, 
        error: 'Owner account is suspended' 
      });
    }
    
    // Enhanced user object for owner context
    req.owner = {
      id: user._id,
      email: user.email,
      name: user.name,
      permissions: ['*'], // Wildcard permission for owner
      sessionId: decoded.sessionId
    };
    
    // Track this access in activity log
    if (process.env.NODE_ENV === 'production') {
      require('../models/ActivityLog').create({
        userId: user._id,
        userRole: 'owner',
        userEmail: user.email,
        action: 'owner_api_access',
        entityType: 'system',
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        metadata: {
          endpoint: req.originalUrl,
          method: req.method,
          params: req.params
        }
      }).catch(() => {}); // Don't fail request if logging fails
    }
    
    next();
  } catch (error) {
    console.error('Owner authentication error:', error);
    res.status(401).json({ 
      success: false, 
      error: 'Owner authentication failed' 
    });
  }
};

// Audit logging middleware for owner actions
const auditOwnerAction = async (req, res, next) => {
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Store response data
  res.send = function(data) {
    res._responseData = data;
    return originalSend.call(this, data);
  };
  
  res.json = function(data) {
    res._responseData = data;
    return originalJson.call(this, data);
  };
  
  // Log after response
  res.on('finish', async () => {
    try {
      if (req.owner && res.statusCode >= 200 && res.statusCode < 300) {
        const action = req.body._auditAction || req.route.path.split('/').pop();
        const targetType = req.body._auditTargetType || req.params.entityType;
        
        if (action && targetType && !req.body._skipAudit) {
          await OwnerAuditLog.create({
            ownerId: req.owner.id,
            action,
            targetType,
            targetId: req.params.id || req.body.targetId,
            beforeState: req.body._beforeState,
            afterState: res._responseData?.data || req.body,
            metadata: {
              method: req.method,
              endpoint: req.originalUrl,
              params: req.params,
              body: req.body,
              responseCode: res.statusCode
            },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent'),
            requiresReview: req.body._requiresReview || false
          });
        }
      }
    } catch (error) {
      console.error('Audit logging error:', error);
      // Don't fail the request if audit logging fails
    }
  });
  
  next();
};

// Owner rate limiting (more generous than regular users)
const ownerRateLimit = (windowMs = 60000, max = 300) => {
  const rateLimit = require('express-rate-limit');
  
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: 'Too many requests. Please try again later.'
    },
    skip: (req) => {
      // Skip rate limiting for GET requests
      return req.method === 'GET';
    },
    keyGenerator: (req) => {
      // Use owner ID for rate limiting
      return req.owner?.id || req.ip;
    }
  });
};

// 2FA requirement for critical actions
const require2FAForCriticalAction = async (req, res, next) => {
  const criticalActions = [
    'user_suspended', 'user_unsuspended', 'store_suspended', 'store_unsuspended',
    'order_overridden', 'payment_overridden', 'refund_forced',
    'emergency_shutdown', 'maintenance_mode_toggled'
  ];
  
  const action = req.body.action || req.route.path.split('/').pop();
  
  if (criticalActions.includes(action)) {
    const hasValid2FA = await verifyOwner2FA(req.owner.id, req.body.totpCode);
    
    if (!hasValid2FA) {
      return res.status(403).json({
        success: false,
        error: '2FA verification required for this action',
        requires2FA: true
      });
    }
    
    req.body._confirmedBy2FA = true;
  }
  
  next();
};

// Helper function for 2FA verification
async function verifyOwner2FA(ownerId, totpCode) {
  // In production, integrate with TOTP library like speakeasy
  // For now, return true for development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  // TODO: Implement actual TOTP verification
  // const owner = await User.findById(ownerId).select('+totpSecret');
  // return verifyTOTP(totpCode, owner.totpSecret);
  
  return false; // Default to false in production without implementation
}

module.exports = {
  ownerOnly,
  auditOwnerAction,
  ownerRateLimit,
  require2FAForCriticalAction
};