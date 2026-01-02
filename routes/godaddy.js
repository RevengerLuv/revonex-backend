// server/routes/godaddy.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

// GoDaddy API Configuration
const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;
const GODADDY_API_URL = process.env.GODADDY_API_URL || 'https://api.ote-godaddy.com/v1';

// Middleware to verify user is Pro (optional for search)
// Updated requirePro middleware in domain.js
const requirePro = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Check subscription status
    if (!user.subscription) {
      return res.status(403).json({ 
        error: 'No active subscription',
        message: 'Please subscribe to a plan to use this feature'
      });
    }
    
    const subscription = user.subscription;
    
    // Define which plans can purchase domains
    const canPurchaseDomains = (plan) => {
      const allowedPlans = ['pro', 'enterprise'];
      return allowedPlans.includes(plan.toLowerCase());
    };
    
    // Check if subscription is active and plan can purchase domains
    if (subscription.status !== 'active') {
      return res.status(403).json({ 
        error: 'Subscription not active',
        message: 'Your subscription is not active. Please renew.'
      });
    }
    
    if (!canPurchaseDomains(subscription.plan)) {
      return res.status(403).json({ 
        error: 'Plan restriction',
        message: `Your current plan (${subscription.planName}) does not include custom domain purchase. Upgrade to Pro or Enterprise plan.`,
        currentPlan: subscription.plan,
        requiredPlans: ['pro', 'enterprise'],
        upgradeUrl: '/plans'
      });
    }
    
    next();
  } catch (error) {
    console.error('Subscription check error:', error);
    res.status(500).json({ error: 'Server error checking subscription' });
  }
};

// Check domain availability - REAL GoDaddy API
router.post('/check', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    console.log('Checking GoDaddy for domain:', domain);

    // Call REAL GoDaddy API
    const response = await axios.get(
      `${GODADDY_API_URL}/domains/available`,
      {
        params: {
          domain: domain,
          checkType: 'FAST',
          forTransfer: false
        },
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log('GoDaddy API response:', response.data);

    if (response.data.available !== undefined) {
      // Convert USD to INR (approximate conversion)
      const usdToInr = 83; // Current rate
      const priceInr = response.data.price ? Math.round(response.data.price * usdToInr) : 699;
      
      res.json({
        success: true,
        data: {
          domain: domain,
          available: response.data.available,
          price: priceInr,
          currency: 'INR',
          premium: response.data.premium || false,
          premiumPrice: response.data.premiumPrice ? Math.round(response.data.premiumPrice * usdToInr) : null,
          period: response.data.period || 1,
          grade: getDomainGrade(domain.split('.')[0]),
          isAdult: response.data.isAdult || false
        }
      });
    } else {
      res.json({
        success: true,
        data: {
          domain: domain,
          available: false,
          reason: response.data.reason || 'Domain is not available'
        }
      });
    }
  } catch (error) {
    console.error('GoDaddy check error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to check domain availability',
      details: error.response?.data?.message || error.message
    });
  }
});

// Bulk domain check - REAL GoDaddy API
router.post('/check-bulk', async (req, res) => {
  try {
    const { domains } = req.body;
    
    if (!Array.isArray(domains) || domains.length === 0) {
      return res.status(400).json({ error: 'Domains array is required' });
    }

    console.log('Bulk checking GoDaddy for domains:', domains);

    // Limit to 5 domains per request (GoDaddy limit)
    const domainsToCheck = domains.slice(0, 5);
    
    // Call REAL GoDaddy Bulk API
    const response = await axios.post(
      `${GODADDY_API_URL}/domains/available`,
      domainsToCheck,
      {
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    console.log('GoDaddy bulk API response:', response.data);

    const usdToInr = 83;
    const results = response.data.domains.map(item => ({
      domain: item.domain,
      available: item.available,
      price: item.price ? Math.round(item.price * usdToInr) : getDefaultPriceForTld(item.domain),
      currency: 'INR',
      premium: item.premium || false,
      period: item.period || 1,
      tld: `.${item.domain.split('.').pop()}`,
      grade: getDomainGrade(item.domain.split('.')[0])
    }));

    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('GoDaddy bulk check error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to check domains',
      details: error.response?.data?.message || error.message
    });
  }
});

// Get TLD pricing - REAL GoDaddy API
router.get('/pricing/:tld', async (req, res) => {
  try {
    const { tld } = req.params;
    
    console.log('Getting pricing for TLD:', tld);

    // Call GoDaddy API for pricing
    const response = await axios.get(
      `${GODADDY_API_URL}/domains/tlds/${tld}`,
      {
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Accept': 'application/json'
        }
      }
    );

    const tldData = response.data;
    const usdToInr = 83;
    
    res.json({
      success: true,
      data: {
        tld: `.${tld}`,
        name: tldData.name || tld,
        category: tldData.category || 'Generic',
        listPrice: tldData.listPrice ? Math.round(tldData.listPrice * usdToInr) : 699,
        salePrice: tldData.salePrice ? Math.round(tldData.salePrice * usdToInr) : 599,
        currency: 'INR',
        period: tldData.period || 1,
        features: tldData.features || [],
        registration: {
          min: tldData.registrationMin || 1,
          max: tldData.registrationMax || 10
        }
      }
    });
  } catch (error) {
    console.error('GoDaddy pricing error:', error.response?.data || error.message);
    
    // Fallback pricing
    const fallbackPrices = {
      'com': { listPrice: 699, salePrice: 599 },
      'in': { listPrice: 399, salePrice: 299 },
      'io': { listPrice: 2499, salePrice: 1999 },
      'net': { listPrice: 799, salePrice: 699 },
      'org': { listPrice: 799, salePrice: 699 },
      'co': { listPrice: 1299, salePrice: 999 },
      'store': { listPrice: 499, salePrice: 399 },
      'shop': { listPrice: 499, salePrice: 399 },
      'online': { listPrice: 299, salePrice: 199 },
      'tech': { listPrice: 599, salePrice: 499 }
    };
    
    const priceData = fallbackPrices[tld] || { listPrice: 699, salePrice: 599 };
    
    res.json({
      success: true,
      data: {
        tld: `.${tld}`,
        name: tld.toUpperCase(),
        listPrice: priceData.listPrice,
        salePrice: priceData.salePrice,
        currency: 'INR',
        period: 1
      }
    });
  }
});

// Helper function to grade domain quality
const getDomainGrade = (domainName) => {
  if (!domainName) return 'B';
  
  const name = domainName.toLowerCase();
  
  // Simple grading logic
  if (name.length <= 3) return 'A+';
  if (name.length <= 5) return 'A';
  if (name.length <= 8) return 'B';
  if (name.length <= 12) return 'C';
  return 'D';
};

// Helper function for default pricing
const getDefaultPriceForTld = (domain) => {
  const tld = domain.split('.').pop();
  const prices = {
    'com': 699,
    'in': 399,
    'io': 2499,
    'net': 799,
    'org': 799,
    'co': 999,
    'store': 499,
    'shop': 499,
    'online': 299,
    'tech': 599,
    'site': 199,
    'xyz': 99,
    'app': 1199,
    'dev': 999,
    'me': 699,
    'info': 599
  };
  return prices[tld] || 699;
};

module.exports = router;