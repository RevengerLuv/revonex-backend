const Store = require('../models/Store');

// Middleware to check if user can create more stores based on their subscription
const checkStoreLimit = async (req, res, next) => {
  try {
    console.log('🔍 checkStoreLimit: User data:', {
      userId: req.user?._id,
      hasSubscription: !!req.user?.subscription,
      subscription: req.user?.subscription
    });

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

      if (subscription) {
        console.log('🔍 checkStoreLimit: Subscription details:', subscription);

        // Only use the plan if subscription is active and not expired
        if (subscription.status === 'active' && subscription.plan) {
          // Double-check if subscription hasn't expired
          const now = new Date();
          const endDate = new Date(subscription.endDate);
          console.log('🔍 checkStoreLimit: Date check:', { now, endDate, isValid: now <= endDate });

          if (now <= endDate) {
            userPlan = subscription.plan;
          } else {
            // Mark as expired in database if not already
            subscription.status = 'expired';
            // Note: We don't save here to avoid blocking the request
          }
        }
      }
    }

    console.log('🔍 checkStoreLimit: Final userPlan:', userPlan);

    const planLimits = {
      free: 5,
      starter: 15,
      pro: 30,
      enterprise: 100
    };

    const maxStores = planLimits[userPlan] || 5;

    // Count user's existing active stores
    const existingStoresCount = await Store.countDocuments({
      owner: req.user.id,
      isActive: true,
      isBanned: { $ne: true }
    });

    if (existingStoresCount >= maxStores) {
      return res.status(403).json({
        success: false,
        error: `You have reached the maximum number of stores (${maxStores}) for your ${userPlan} plan. Please upgrade your subscription to create more stores.`
      });
    }

    // Add limit info to request for use in controller
    req.storeLimit = {
      currentStores: existingStoresCount,
      maxStores: maxStores,
      plan: userPlan,
      canCreate: existingStoresCount < maxStores
    };

    next();
  } catch (error) {
    console.error('Error checking store limit:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check store creation limits'
    });
  }
};

module.exports = checkStoreLimit;
