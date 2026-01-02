const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const Store = require('../models/Store');
const Product = require('../models/Products');

// @route   GET /api/products/limits
// @desc    Get user's product creation limits
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
        }
      }
    }
    const planLimits = {
      free: 18,
      starter: 30,
      pro: 50
    };

    const maxProducts = planLimits[userPlan] || 18;

    // Get all stores owned by the user
    const userStores = await Store.find({
      owner: req.user._id,
      isActive: true,
      isBanned: { $ne: true }
    }).select('_id');

    const storeIds = userStores.map(store => store._id);

    // Count user's existing active products across all stores
    const existingProductsCount = await Product.countDocuments({
      store: { $in: storeIds },
      isActive: true
    });

    const canCreate = existingProductsCount < maxProducts;

    res.json({
      success: true,
      data: {
        currentCount: existingProductsCount,
        maxLimit: maxProducts,
        remaining: maxProducts - existingProductsCount,
        plan: userPlan,
        canCreate: canCreate
      }
    });
  } catch (error) {
    console.error('Error fetching product limits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product limits'
    });
  }
});

module.exports = router;
