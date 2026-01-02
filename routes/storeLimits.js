const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Store = require('../models/Store');

// @route   GET /api/stores/limits
// @desc    Get user's store creation limits
router.get('/limits', auth, async (req, res) => {
  try {
    // Check if user has an active subscription
    let userPlan = 'free';
    if (req.user) {
      // First try direct subscription access
      let subscription = req.user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (req.user.user?.subscription) {
          subscription = req.user.user.subscription;
        } else if (req.user.profile?.subscription) {
          subscription = req.user.profile.subscription;
        } else if (req.user.data?.subscription) {
          subscription = req.user.data.subscription;
        } else if (req.user._doc?.subscription) { // Check mongoose document structure
          subscription = req.user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          userPlan = subscription.plan;
        } else {
          // Mark as expired in database if not already
          subscription.status = 'expired';
          // Note: We don't save here to avoid blocking the request
        }
      }
    }

    const planLimits = {
      free: 5,
      starter: 10,
      pro: 50,
      enterprise: 100
    };

    const maxStores = planLimits[userPlan] || 5;

    // Count user's existing active stores
    const existingStoresCount = await Store.countDocuments({
      owner: req.user.id,
      isActive: true,
      isBanned: { $ne: true }
    });

    const canCreate = existingStoresCount < maxStores;

    console.log('🔍 Store Limits Debug:', {
      userId: req.user.id,
      userPlan: userPlan,
      userSubscription: req.user.subscription,
      maxStores: maxStores,
      existingStoresCount: existingStoresCount,
      canCreate: canCreate
    });

    res.json({
      success: true,
      data: {
        currentStores: existingStoresCount,
        maxStores: maxStores,
        plan: userPlan,
        canCreate: canCreate
      }
    });
  } catch (error) {
    console.error('Error fetching store limits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch store limits'
    });
  }
});

module.exports = router;