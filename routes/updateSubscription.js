const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { auth } = require('../middleware/auth');

// POST /api/update-subscription - Direct subscription update
router.post('/', auth, async (req, res) => {
  try {
    const { planId, planName, price } = req.body;
    
    console.log('📝 Direct subscription update for user:', req.user.id);
    console.log('Plan:', { planId, planName, price });
    
    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }
    
    // Update subscription
    user.subscription = {
      plan: planId,
      planName: planName,
      price: price,
      status: 'active',
      startDate: new Date(),
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      billingCycle: 'monthly',
      transactionId: `DIRECT_${Date.now()}`,
      features: getPlanFeatures(planId)
    };
    
    await user.save();
    
    console.log('✅ Direct subscription updated for user:', user.email);
    
    res.json({
      success: true,
      message: `Successfully updated to ${planName} plan!`,
      subscription: user.subscription,
      user: {
        id: user._id,
        name: user.name,
        email: user.email
      }
    });
    
  } catch (error) {
    console.error('Direct subscription update error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Helper function
function getPlanFeatures(planId) {
  const featuresMap = {
    free: ['Up to 25 products', 'Community support'],
    starter: ['Up to 100 products', 'Basic analytics', '2GB storage'],
    pro: ['Unlimited products', 'Advanced analytics', '10GB storage'],
    enterprise: ['Everything in Pro', 'Unlimited storage']
  };
  
  return featuresMap[planId] || featuresMap.free;
}

module.exports = router;