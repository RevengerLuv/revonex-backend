// [file name]: activityTracker.js
const ActivityLog = require('../models/ActivityLog');

// Track all user activities
const trackActivity = (options = {}) => {
  return async (req, res, next) => {
    // Skip tracking for certain paths
    if (req.path.includes('/health') || req.path.includes('/ping')) {
      return next();
    }
    
    // Don't await - fire and forget
    process.nextTick(async () => {
      try {
        const user = req.user || req.owner;
        
        if (!user) {
          return;
        }
        
        // Calculate risk score
        const riskScore = calculateRiskScore(req, user);
        
        // Log the activity
        await ActivityLog.create({
          userId: user.id,
          userRole: user.role || 'owner',
          userEmail: user.email,
          action: getActionFromRequest(req),
          entityType: getEntityTypeFromRequest(req),
          entityId: req.params.id || req.body.id,
          storeId: req.params.storeId || req.body.storeId || req.store?._id,
          sessionId: req.sessionID,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          deviceInfo: getDeviceInfo(req),
          metadata: {
            method: req.method,
            endpoint: req.originalUrl,
            params: req.params,
            body: sanitizeRequestBody(req.body),
            responseCode: res.statusCode
          },
          riskScore,
          isSuspicious: riskScore > 70
        });
        
        // Trigger real-time alerts for suspicious activities
        if (riskScore > 70) {
          triggerSuspiciousActivityAlert(req, user, riskScore);
        }
      } catch (error) {
        console.error('Activity tracking error:', error);
        // Don't fail the request
      }
    });
    
    next();
  };
};

// Helper functions
function getActionFromRequest(req) {
  const method = req.method;
  const path = req.path;
  
  if (path.includes('/login')) return 'user_login';
  if (path.includes('/logout')) return 'user_logout';
  if (path.includes('/order')) return method === 'POST' ? 'order_create' : 'order_view';
  if (path.includes('/payment')) return 'payment_' + (method === 'POST' ? 'initiated' : 'viewed');
  if (path.includes('/product')) return method === 'POST' ? 'product_create' : method === 'PUT' ? 'product_update' : 'product_view';
  
  return method.toLowerCase() + '_' + path.split('/').filter(Boolean).join('_');
}

function getEntityTypeFromRequest(req) {
  const path = req.path;
  if (path.includes('/user')) return 'user';
  if (path.includes('/store')) return 'store';
  if (path.includes('/product')) return 'product';
  if (path.includes('/order')) return 'order';
  if (path.includes('/payment')) return 'payment';
  return 'system';
}

function getDeviceInfo(req) {
  const ua = req.get('User-Agent') || '';
  if (ua.match(/Mobile/)) return 'mobile';
  if (ua.match(/Tablet/)) return 'tablet';
  return 'desktop';
}

function calculateRiskScore(req, user) {
  let score = 0;
  
  // High risk actions
  const highRiskActions = ['password_reset', 'payment_override', 'balance_adjust'];
  if (highRiskActions.some(action => req.path.includes(action))) {
    score += 40;
  }
  
  // Multiple rapid requests
  if (req._rapidRequests > 10) {
    score += 30;
  }
  
  // Unusual time (e.g., 2 AM)
  const hour = new Date().getHours();
  if (hour >= 0 && hour <= 5) {
    score += 15;
  }
  
  // New device/IP (would need session tracking)
  // For now, placeholder
  
  return Math.min(score, 100);
}

function sanitizeRequestBody(body) {
  if (!body) return {};
  
  const sanitized = { ...body };
  
  // Remove sensitive fields
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'creditCard', 'cvv'];
  sensitiveFields.forEach(field => {
    if (sanitized[field]) {
      sanitized[field] = '***REDACTED***';
    }
  });
  
  return sanitized;
}

async function triggerSuspiciousActivityAlert(req, user, riskScore) {
  // In production, send email/slack alerts
  console.warn('🚨 SUSPICIOUS ACTIVITY DETECTED:', {
    user: user.email,
    role: user.role,
    action: req.method + ' ' + req.originalUrl,
    riskScore,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // TODO: Send real-time alert via WebSocket to owner dashboard
}

// Export tracking function
module.exports = trackActivity;