const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware that allows both store owners and system owners to access withdrawal management
const storeOwnerOrOwner = async (req, res, next) => {
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

    // Allow both 'owner' and 'store_owner' roles
    if (user.role !== 'owner' && user.role !== 'store_owner') {
      return res.status(403).json({
        success: false,
        error: 'Owner or store owner access required'
      });
    }

    // Check if account is active
    if (user.isBanned || !user.isActive) {
      return res.status(403).json({
        success: false,
        error: 'Account is suspended'
      });
    }

    // Enhanced user object for owner/store owner context
    req.owner = {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role,
      permissions: user.role === 'owner' ? ['*'] : ['withdrawals'], // Wildcard for owner, limited for store_owner
      sessionId: decoded.sessionId
    };

    // Track this access in activity log for owners
    if (user.role === 'owner' && process.env.NODE_ENV === 'production') {
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
    console.error('Store owner/owner authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

module.exports = {
  storeOwnerOrOwner
};
