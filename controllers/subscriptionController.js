const User = require('../models/User');

// Helper function to calculate end date EXACTLY based on months
const calculateEndDate = (startDate, durationMonths) => {
  const start = new Date(startDate);
  let endDate = new Date(start);
  
  console.log(`📅 Calculating end date: Start=${startDate.toISOString()}, Duration=${durationMonths} months`);
  
  // Add exact months (calendar months)
  endDate.setMonth(start.getMonth() + durationMonths);
  
  // Handle edge case: If starting day doesn't exist in target month
  // Example: Jan 31 -> Feb 28/29
  if (start.getDate() !== endDate.getDate()) {
    endDate.setDate(0); // Set to last day of previous month
  }
  
  // Add 1 day minus 1 second to make it end at 23:59:59 of the last day
  endDate.setDate(endDate.getDate() + 1);
  endDate.setSeconds(endDate.getSeconds() - 1);
  
  console.log(`📅 Calculated end date: ${endDate.toISOString()}`);
  console.log(`📊 Total days difference: ${Math.round((endDate - start) / (1000 * 60 * 60 * 24))} days`);
  
  return endDate;
};

// Helper function to get plan features
function getPlanFeatures(planId) {
  const featuresMap = {
    free: [
      'Up to 18 products',
      'Manage up to 5 stores',
      'Community support',
      'Decent Store Performance',
      'Smart Order Management',
      'Manual order delivery',
      'Limited customization',
      'Basic protection'
    ],
    starter: [
      'Up to 30 products',
      'Run 15 Fully-Managed Stores',
      'Standard support',
      'Custom Sub-domain',
      'Standard themes',
      'Expert Analytics Dashboard',
      'Secure & Optimized Checkout',
      'Manual + semi-automatic delivery',
      'Discount codes & coupons',
      'Basic SEO settings'
    ],
    pro: [
      'Unlock 50 Premium Products',
      'Custom Domain',
      'Manage up to 30 stores',
      'Advanced Analytics Dashboard',
      '0% Transaction Fee',
      'Unlimited Customer Queries',
      'Fully automated delivery',
      'Custom Domain integrations'
    ],
    enterprise: [
      'Unlock 80 Premium Products',
      'Enterprise analytics dashboard',
      'Manage up to 50 stores',
      'Custom Domain',
      '0% Transaction Fee',
      'Dedicated Priority Support',
      'Super Fast & High Performance Store',
      'Top Notch SEO',
      'Custom Integrations'
    ]
  };
  
  return featuresMap[planId] || featuresMap.free;
}

// Helper function to get plan base price
function getPlanBasePrice(planId) {
  const priceMap = {
    'free': 0,
    'starter': 149,
    'pro': 349,
    'enterprise': 799
  };
  
  return priceMap[planId] || 0;
}

const subscriptionController = {
  // UPGRADE SUBSCRIPTION
  async upgradeSubscription(req, res) {
    try {
      console.log('📊 ========== UPGRADE SUBSCRIPTION REQUEST ==========');
      console.log('👤 User ID:', req.user.id);
      console.log('📦 Request Body:', JSON.stringify(req.body, null, 2));
      
      const { 
        planId, 
        planName, 
        price, 
        billingCycle = 'monthly',
        validityMonths,           // Duration in months (e.g., 1, 3, 6, 12, 24)
        durationMonths,           // Alternative name
        monthlyPrice,
        discount = 0,
        razorpayPaymentId, 
        razorpayOrderId,
        transactionId
      } = req.body;
      
      // Validate required fields
      if (!planId) {
        return res.status(400).json({
          success: false,
          error: 'Plan ID is required'
        });
      }
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // Determine subscription duration
      let subscriptionMonths = 1; // Default 1 month
      
      if (validityMonths && !isNaN(validityMonths)) {
        subscriptionMonths = parseInt(validityMonths);
      } else if (durationMonths && !isNaN(durationMonths)) {
        subscriptionMonths = parseInt(durationMonths);
      } else if (billingCycle === 'yearly') {
        subscriptionMonths = 12; // Yearly = 12 months
      }
      
      console.log(`⏰ Subscription Duration: ${subscriptionMonths} months`);
      
      // Calculate dates
      const startDate = new Date();
      const endDate = calculateEndDate(startDate, subscriptionMonths);
      
      // Calculate total days
      const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
      
      // Get base price for the plan
      const basePrice = getPlanBasePrice(planId);
      
      // Prepare subscription object
      const subscriptionData = {
        plan: planId,
        planName: planName || (planId.charAt(0).toUpperCase() + planId.slice(1)),
        price: price || 0,
        basePrice: basePrice,
        status: 'active',
        startDate: startDate,
        endDate: endDate,
        endTimestamp: endDate.getTime(),
        billingCycle: billingCycle,
        validityMonths: subscriptionMonths,
        durationMonths: subscriptionMonths,
        totalDays: totalDays,
        monthlyPrice: monthlyPrice || (price / subscriptionMonths),
        discount: discount,
        razorpayPaymentId: razorpayPaymentId || null,
        razorpayOrderId: razorpayOrderId || null,
        transactionId: transactionId || `SUB_${Date.now()}`,
        features: getPlanFeatures(planId),
        upgradedAt: new Date(),
        lastUpdated: new Date()
      };
      
      console.log('📋 Subscription Data to Save:', JSON.stringify(subscriptionData, null, 2));
      
      // Save to user
      user.subscription = subscriptionData;
      user.lastSubscriptionUpdate = new Date();
      
      await user.save();
      
      console.log('✅ ========== SUBSCRIPTION UPGRADED SUCCESSFULLY ==========');
      console.log('📧 User:', user.email);
      console.log('📅 Start Date:', startDate.toISOString());
      console.log('📅 End Date:', endDate.toISOString());
      console.log('⏰ Duration:', subscriptionMonths, 'months');
      console.log('📊 Total Days:', totalDays, 'days');
      console.log('💰 Price:', price);
      console.log('🎯 Plan:', planName || planId);
      
      res.json({
        success: true,
        message: `Successfully upgraded to ${planName || planId} plan for ${subscriptionMonths} months (${totalDays} days)!`,
        subscription: user.subscription,
        details: {
          durationMonths: subscriptionMonths,
          totalDays: totalDays,
          endDate: endDate.toISOString(),
          endDateFormatted: endDate.toLocaleDateString(),
          timeRemaining: totalDays
        }
      });
      
    } catch (error) {
      console.error('❌ Upgrade subscription error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to upgrade subscription: ' + error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  },

  // GET CURRENT SUBSCRIPTION
  async getCurrentSubscription(req, res) {
    try {
      console.log('📊 ========== GET CURRENT SUBSCRIPTION ==========');
      console.log('👤 User ID:', req.user.id);
      
      const user = await User.findById(req.user.id).select('subscription name email');
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // If no subscription exists, create a default FREE one
      if (!user.subscription) {
        console.log('ℹ️ No subscription found, creating default FREE subscription');
        
        const startDate = new Date();
        const endDate = calculateEndDate(startDate, 1); // 1 month for free
        const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
        
        user.subscription = {
          plan: 'free',
          planName: 'Free',
          price: 0,
          basePrice: 0,
          status: 'active',
          startDate: startDate,
          endDate: endDate,
          endTimestamp: endDate.getTime(),
          billingCycle: 'monthly',
          validityMonths: 1,
          durationMonths: 1,
          totalDays: totalDays,
          monthlyPrice: 0,
          discount: 0,
          features: getPlanFeatures('free'),
          createdAt: new Date()
        };
        
        await user.save();
      }
      
      const subscription = user.subscription;
      const now = new Date();
      const endDate = new Date(subscription.endDate);
      
      console.log('📅 Subscription Details:');
      console.log('   Plan:', subscription.plan);
      console.log('   Status:', subscription.status);
      console.log('   Start:', subscription.startDate);
      console.log('   End:', subscription.endDate);
      console.log('   Now:', now.toISOString());
      console.log('   Is Expired?', now > endDate);
      
      // Check if subscription is expired
      if (subscription.status === 'active' && now > endDate) {
        console.log('⚠️ Subscription expired, updating status...');
        subscription.status = 'expired';
        user.subscription = subscription;
        await user.save();
      }
      
      // Calculate time remaining
      let timeRemaining = { days: 0, hours: 0, minutes: 0, seconds: 0 };
      let isActive = subscription.status === 'active' && now <= endDate;
      
      if (isActive) {
        const diffMs = endDate.getTime() - now.getTime();
        if (diffMs > 0) {
          timeRemaining.days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          timeRemaining.hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
          timeRemaining.minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
          timeRemaining.seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
        }
      }
      
      // Calculate total subscription days
      const totalDays = subscription.totalDays || 
        Math.round((endDate - new Date(subscription.startDate)) / (1000 * 60 * 60 * 24));
      
      res.json({
        success: true,
        subscription: subscription,
        status: {
          isActive: isActive,
          isExpired: now > endDate,
          timeRemaining: timeRemaining,
          totalDaysRemaining: timeRemaining.days,
          totalSubscriptionDays: totalDays,
          percentageUsed: totalDays > 0 ? 
            Math.round(((totalDays - timeRemaining.days) / totalDays) * 100) : 0,
          endsAt: endDate.toISOString(),
          endsAtFormatted: endDate.toLocaleDateString()
        },
        user: {
          id: user._id,
          name: user.name,
          email: user.email
        }
      });
      
    } catch (error) {
      console.error('❌ Get subscription error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get subscription' 
      });
    }
  },

  // GET SUBSCRIPTION PLANS
  async getSubscriptionPlans(req, res) {
    try {
      console.log('📊 Getting subscription plans');
      
      const plans = [
        {
          id: 'free',
          name: 'Free',
          price: 0,
          basePrice: 0,
          billing: 'Forever',
          description: 'Perfect for getting started',
          icon: '🌱',
          features: getPlanFeatures('free'),
          durationOptions: [
            { months: 1, label: '1 Month', price: 0 }
          ],
          recommended: false
        },
        {
          id: 'starter',
          name: 'Starter',
          price: 149,
          basePrice: 149,
          billing: 'Billed monthly',
          description: 'For growing businesses',
          icon: '🚀',
          features: getPlanFeatures('starter'),
          durationOptions: [
            { months: 1, label: '1 Month', price: 149, discount: 0 },
            { months: 3, label: '3 Months', price: 149 * 3 * 0.90, discount: 10 }, // 10% off
            { months: 6, label: '6 Months', price: 149 * 6 * 0.80, discount: 20 }, // 20% off
            { months: 12, label: '1 Year', price: 149 * 12 * 0.75, discount: 25 }, // 25% off
            { months: 24, label: '2 Years', price: 149 * 24 * 0.70, discount: 30 }  // 30% off
          ],
          recommended: false
        },
        {
          id: 'pro',
          name: 'Pro',
          price: 349,
          basePrice: 349,
          billing: 'Billed monthly',
          description: 'Scale your business',
          icon: '⚡',
          features: getPlanFeatures('pro'),
          durationOptions: [
            { months: 1, label: '1 Month', price: 349, discount: 0 },
            { months: 3, label: '3 Months', price: 349 * 3 * 0.90, discount: 10 },
            { months: 6, label: '6 Months', price: 349 * 6 * 0.80, discount: 20 },
            { months: 12, label: '1 Year', price: 349 * 12 * 0.75, discount: 25 },
            { months: 24, label: '2 Years', price: 349 * 24 * 0.70, discount: 30 }
          ],
          recommended: true
        },
        {
          id: 'enterprise',
          name: 'Enterprise',
          price: 799,
          basePrice: 799,
          billing: 'Billed monthly',
          description: 'Advanced features for teams',
          icon: '🏢',
          features: getPlanFeatures('enterprise'),
          durationOptions: [
            { months: 1, label: '1 Month', price: 799, discount: 0 },
            { months: 3, label: '3 Months', price: 799 * 3 * 0.90, discount: 10 },
            { months: 6, label: '6 Months', price: 799 * 6 * 0.80, discount: 20 },
            { months: 12, label: '1 Year', price: 799 * 12 * 0.75, discount: 25 },
            { months: 24, label: '2 Years', price: 799 * 24 * 0.70, discount: 30 }
          ],
          recommended: false
        }
      ];
      
      res.json({
        success: true,
        plans: plans,
        durationOptions: [
          { months: 1, label: '1 Month', discount: 0 },
          { months: 3, label: '3 Months', discount: 10 },
          { months: 6, label: '6 Months', discount: 20 },
          { months: 12, label: '1 Year', discount: 25 },
          { months: 24, label: '2 Years', discount: 30 }
        ]
      });
      
    } catch (error) {
      console.error('❌ Get plans error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get subscription plans' 
      });
    }
  },

  // CANCEL SUBSCRIPTION
  async cancelSubscription(req, res) {
    try {
      console.log('📊 ========== CANCEL SUBSCRIPTION ==========');
      console.log('👤 User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      if (!user.subscription) {
        return res.status(400).json({
          success: false,
          error: 'No active subscription found'
        });
      }
      
      // Update subscription status
      user.subscription.status = 'cancelled';
      user.subscription.cancelledAt = new Date();
      user.subscription.lastUpdated = new Date();
      
      await user.save();
      
      console.log('✅ Subscription cancelled for user:', user.email);
      
      res.json({
        success: true,
        message: 'Subscription cancelled successfully',
        subscription: user.subscription
      });
      
    } catch (error) {
      console.error('❌ Cancel subscription error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to cancel subscription' 
      });
    }
  },

  // DOWNGRADE TO FREE
  async downgradeToFree(req, res) {
    try {
      console.log('📊 ========== DOWNGRADE TO FREE ==========');
      console.log('👤 User ID:', req.user.id);
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      const startDate = new Date();
      const endDate = calculateEndDate(startDate, 1); // Free plan = 1 month
      const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
      
      user.subscription = {
        plan: 'free',
        planName: 'Free',
        price: 0,
        basePrice: 0,
        status: 'active',
        startDate: startDate,
        endDate: endDate,
        endTimestamp: endDate.getTime(),
        billingCycle: 'monthly',
        validityMonths: 1,
        durationMonths: 1,
        totalDays: totalDays,
        monthlyPrice: 0,
        discount: 0,
        features: getPlanFeatures('free'),
        downgradedAt: new Date(),
        lastUpdated: new Date()
      };
      
      await user.save();
      
      console.log('✅ Downgraded to Free plan for user:', user.email);
      console.log(`📅 Free plan valid until: ${endDate.toISOString()} (${totalDays} days)`);
      
      res.json({
        success: true,
        message: 'Successfully downgraded to Free plan',
        subscription: user.subscription,
        details: {
          endDate: endDate.toISOString(),
          totalDays: totalDays
        }
      });
      
    } catch (error) {
      console.error('❌ Downgrade error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to downgrade subscription' 
      });
    }
  },

  // GET SUBSCRIPTION HISTORY
  async getSubscriptionHistory(req, res) {
    try {
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // In a real app, you'd have a separate SubscriptionHistory model
      // For now, return current subscription as history
      const history = user.subscription ? [user.subscription] : [];
      
      res.json({
        success: true,
        history: history,
        count: history.length
      });
      
    } catch (error) {
      console.error('❌ Get history error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get subscription history' 
      });
    }
  },

  // DEBUG ENDPOINT - Get detailed subscription info
  async debugSubscription(req, res) {
    try {
      const user = await User.findById(req.user.id).select('email subscription name');
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const now = new Date();
      const subscription = user.subscription;
      
      let debugInfo = {
        user: {
          id: user._id,
          email: user.email,
          name: user.name
        },
        currentTime: now.toISOString(),
        hasSubscription: !!subscription
      };
      
      if (subscription) {
        const startDate = new Date(subscription.startDate);
        const endDate = new Date(subscription.endDate);
        const totalMs = endDate.getTime() - startDate.getTime();
        const totalDays = Math.round(totalMs / (1000 * 60 * 60 * 24));
        const remainingMs = endDate.getTime() - now.getTime();
        const remainingDays = Math.round(remainingMs / (1000 * 60 * 60 * 24));
        
        debugInfo.subscription = {
          plan: subscription.plan,
          planName: subscription.planName,
          status: subscription.status,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          endTimestamp: subscription.endTimestamp,
          billingCycle: subscription.billingCycle,
          validityMonths: subscription.validityMonths,
          durationMonths: subscription.durationMonths,
          totalDays: subscription.totalDays || totalDays,
          price: subscription.price,
          basePrice: subscription.basePrice,
          monthlyPrice: subscription.monthlyPrice,
          discount: subscription.discount,
          isActive: subscription.status === 'active',
          isExpired: now > endDate,
          timeUntilExpiry: remainingMs,
          totalSubscriptionDays: totalDays,
          daysRemaining: remainingDays,
          percentageUsed: totalDays > 0 ? Math.round(((totalDays - remainingDays) / totalDays) * 100) : 0,
          canPurchaseDomains: subscription.status === 'active' && now <= endDate && ['pro', 'enterprise'].includes(subscription.plan?.toLowerCase())
        };
      }
      
      res.json({
        success: true,
        debug: debugInfo,
        message: 'Subscription debug information'
      });
      
    } catch (error) {
      console.error('❌ Debug subscription error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to debug subscription'
      });
    }
  }
};

module.exports = subscriptionController;