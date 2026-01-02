// routes/subscription.js
const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { auth } = require('../middleware/auth');
const User = require('../models/User');

// Enable CORS for these routes
router.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  next();
});

// Handle preflight requests
router.options('*', (req, res) => {
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.sendStatus(200);
});

// All subscription routes require authentication
router.use(auth);

// GET /api/subscription/current - Get current subscription
router.get('/current', subscriptionController.getCurrentSubscription);

// GET /api/subscription/plans - Get all plans
router.get('/plans', subscriptionController.getSubscriptionPlans);
// GET /api/subscription/current
router.get('/current', subscriptionController.getCurrentSubscription);

// GET /api/subscription/plans
router.get('/plans', subscriptionController.getSubscriptionPlans);

// POST /api/subscription/upgrade
router.post('/upgrade', subscriptionController.upgradeSubscription);

// POST /api/subscription/cancel
router.post('/cancel', subscriptionController.cancelSubscription);

// POST /api/subscription/downgrade
router.post('/downgrade', subscriptionController.downgradeToFree);

// GET /api/subscription/history
router.get('/history', subscriptionController.getSubscriptionHistory);

// GET /api/subscription/debug
router.get('/debug', subscriptionController.debugSubscription);
// POST /api/subscription/upgrade - Upgrade subscription
router.post('/upgrade', subscriptionController.upgradeSubscription);
router.post('/update-status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    if (user.subscription) {
      user.subscription.status = status;
      await user.save();
      
      res.json({
        success: true,
        message: 'Subscription status updated'
      });
    } else {
      res.status(400).json({
        success: false,
        error: 'No subscription found'
      });
    }
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update status' 
    });
  }
});
// POST /api/subscription/cancel - Cancel subscription
router.post('/cancel', (req, res) => {
  res.json({
    success: true,
    message: 'Cancel endpoint - implement as needed'
  });
});

// DEBUG: GET /api/subscription/debug - Debug current user subscription
router.get('/debug', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('email subscription');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const subscription = user.subscription;
    let debugInfo = {
      email: user.email,
      hasSubscription: !!subscription,
      currentTime: now.toISOString()
    };

    if (subscription) {
      const endDate = new Date(subscription.endDate);
      debugInfo = {
        ...debugInfo,
        plan: subscription.plan,
        planName: subscription.planName,
        status: subscription.status,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        endTimestamp: subscription.endTimestamp,
        billingCycle: subscription.billingCycle,
        isActive: subscription.status === 'active',
        isExpired: now > endDate,
        isPro: subscription.plan?.toLowerCase() === 'pro',
        canPurchaseDomains: subscription.status === 'active' && now <= endDate && ['pro', 'enterprise'].includes(subscription.plan?.toLowerCase()),
        timeUntilExpiry: endDate - now
      };
    }

    res.json({
      success: true,
      debug: debugInfo
    });

  } catch (error) {
    console.error('Debug subscription error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to debug subscription'
    });
  }
});

module.exports = router;
