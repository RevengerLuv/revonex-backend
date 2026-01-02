const Product = require('../models/Products');
const Store = require('../models/Store');

const checkProductLimit = async (req, res, next) => {
  try {
    const user = req.user;
    
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Check if user has an active subscription
    let userPlan = 'free';
    if (user) {
      // First try direct subscription access
      let subscription = user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (user.user?.subscription) {
          subscription = user.user.subscription;
        } else if (user.profile?.subscription) {
          subscription = user.profile.subscription;
        } else if (user.data?.subscription) {
          subscription = user.data.subscription;
        } else if (user._doc?.subscription) { // Check mongoose document structure
          subscription = user._doc.subscription;
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
      pro: 50,
      enterprise: 1000
    };

    const maxProducts = planLimits[userPlan] || 18;

    // Get all stores owned by the user
    const userStores = await Store.find({
      owner: user._id,
      isActive: true,
      isBanned: { $ne: true }
    }).select('_id');

    const storeIds = userStores.map(store => store._id);

    // Count user's existing active products across all stores (non-archived)
    const existingProductsCount = await Product.countDocuments({
      store: { $in: storeIds },
      $or: [
        { status: { $exists: false }, isActive: true },
        { status: { $exists: true }, status: { $ne: 'archived' }, isActive: true }
      ]
    });

    // Add limit info to request for use in controller
    req.productLimits = {
      current: existingProductsCount,
      max: maxProducts,
      remaining: maxProducts - existingProductsCount,
      plan: userPlan,
      canCreate: existingProductsCount < maxProducts
    };

    // Block if limit reached
    if (existingProductsCount >= maxProducts) {
      return res.status(400).json({
        success: false,
        error: `Product creation limit reached!`,
        limitReached: true,
        currentCount: existingProductsCount,
        maxLimit: maxProducts,
        plan: userPlan,
        message: `Your ${userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} plan allows up to ${maxProducts} total products across all stores. Please upgrade your plan to create more products.`
      });
    }

    next();
  } catch (error) {
    console.error('Error checking product limit:', error);
    next(); // Continue anyway, controller will handle errors
  }
};

module.exports = checkProductLimit;