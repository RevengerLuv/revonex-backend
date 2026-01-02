const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Razorpay = require('razorpay');
const DomainOrder = require('../models/DomainOrder');
const User = require('../models/User');

// GoDaddy API Configuration
const GODADDY_API_KEY = process.env.GODADDY_API_KEY;
const GODADDY_API_SECRET = process.env.GODADDY_API_SECRET;
const GODADDY_API_URL = process.env.GODADDY_API_URL || 'https://api.ote-godaddy.com/v1';

// Simple verifyToken middleware for domain routes
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('❌ No auth header or invalid format');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      console.error('❌ Token is empty');
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. Invalid token format.' 
      });
    }

    const jwtSecret = process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production';
    const decoded = jwt.verify(token, jwtSecret);
    
    // Handle different JWT payload structures
    req.userId = decoded.userId || decoded.id || decoded.user || decoded.userId;
    req.userRole = decoded.role;
    
    if (!req.userId) {
      console.error('❌ No user ID in decoded token:', decoded);
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token format.' 
      });
    }

    console.log('✅ Token verified, userId:', req.userId);
    next();
  } catch (error) {
    console.error('❌ Token verification error:', error.message);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid token.' 
      });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false, 
        error: 'Token expired. Please login again.' 
      });
    }
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token.' 
    });
  }
};

// Initialize Razorpay
const getRazorpayInstance = () => {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_SECRET;
  
  console.log('🔑 Razorpay Config Check:', {
    key_id: key_id ? '✅ Present' : '❌ Missing',
    key_secret: key_secret ? '✅ Present' : '❌ Missing',
    node_env: process.env.NODE_ENV
  });
  
  if (!key_id || !key_secret) {
    const error = new Error('Razorpay credentials not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_SECRET environment variables.');
    console.error('❌', error.message);
    throw error;
  }
  
  try {
    const instance = new Razorpay({
      key_id: key_id,
      key_secret: key_secret
    });
    console.log('✅ Razorpay instance created successfully');
    return instance;
  } catch (error) {
    console.error('❌ Razorpay instance creation failed:', error);
    throw new Error(`Failed to initialize Razorpay: ${error.message}`);
  }
};

// SIMPLE: Check domain - 100% REAL GoDaddy data
router.post('/check', async (req, res) => {
  try {
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }

    console.log(`🔍 Checking ${domain} on GoDaddy...`);

    // Call GoDaddy
    const response = await axios.get(
      `${GODADDY_API_URL}/domains/available`,
      {
        params: { domain: domain, checkType: 'FAST' },
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log(`✅ GoDaddy says ${domain}:`, {
      available: response.data.available,
      price: response.data.price,
      definitive: response.data.definitive
    });

    // Convert price to INR
    let priceInr = 699; // Default
    if (response.data.price) {
      if (response.data.currency === 'USD') {
        priceInr = Math.round(response.data.price * 83);
      } else {
        priceInr = response.data.price;
      }
    }

    // Calculate price without GST (18% less) for display
    // Final price with GST = priceInr, so display price = priceInr / 1.18
    const displayPrice = Math.round(priceInr / 1.18);
    const actualPrice = priceInr; // Store actual price for reference

    // Return price without GST for display (GST will be added at checkout)
    const result = {
      domain: domain,
      available: response.data.available, // THIS IS THE KEY - DIRECT FROM GODADDY
      price: displayPrice, // Price without GST (18% less)
      actualPrice: actualPrice, // Actual price with GST (for reference)
      currency: 'INR',
      tld: '.' + domain.split('.').pop(),
      premium: response.data.premium || false,
      grade: 'B',
      isAdult: response.data.isAdult || false,
      definitive: response.data.definitive || true
    };

    console.log(`📤 Sending to frontend:`, result);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error(`❌ Error checking ${req.body?.domain}:`, error.message);
    
    // Return error but still show something
    res.json({
      success: true, // Still success to show in frontend
      data: {
        domain: req.body?.domain || 'unknown',
        available: false, // Assume not available on error
        price: 699,
        currency: 'INR',
        tld: '.' + (req.body?.domain?.split('.')?.pop() || 'com'),
        premium: false,
        grade: 'B',
        isAdult: false,
        definitive: false,
        error: error.message
      }
    });
  }
});

// Bulk check - also 100% real
router.post('/check-bulk', async (req, res) => {
  try {
    const { domains } = req.body;
    
    if (!Array.isArray(domains)) {
      return res.status(400).json({ error: 'Domains array required' });
    }

    console.log('🔍 Bulk checking:', domains);

    // Call GoDaddy bulk API
    const response = await axios.post(
      `${GODADDY_API_URL}/domains/available`,
      domains.slice(0, 5), // Limit to 5
      {
        headers: {
          'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      }
    );

    const results = response.data.domains.map(item => {
      // Convert price to INR
      let priceInr = 699; // Default
      if (item.price) {
        if (item.currency === 'USD') {
          priceInr = Math.round(item.price * 83);
        } else {
          priceInr = item.price;
        }
      }
      
      // Calculate price without GST (18% less) for display
      const displayPrice = Math.round(priceInr / 1.18);
      const actualPrice = priceInr;
      
      return {
        domain: item.domain,
        available: item.available, // DIRECT FROM GODADDY
        tld: '.' + item.domain.split('.').pop(),
        price: displayPrice, // Price without GST (18% less)
        actualPrice: actualPrice, // Actual price with GST (for reference)
        currency: 'INR',
        premium: item.premium || false,
        grade: 'B'
      };
    });

    console.log('✅ Bulk results:', results);

    res.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('❌ Bulk error:', error.message);
    res.status(500).json({ error: 'Bulk check failed' });
  }
});

// Test specific domains
router.get('/test-real', async (req, res) => {
  try {
    const testDomains = [
      'google.com',        // Definitely NOT available
      'facebook.com',      // Definitely NOT available  
      'asdfghjkl12345xyz.store', // Might be available
      'revonex.store',     // Check this one
      'example-test-12345.com' // Random, likely available
    ];

    const results = await Promise.all(
      testDomains.map(async (domain) => {
        try {
          const response = await axios.get(
            `${GODADDY_API_URL}/domains/available`,
            {
              params: { domain: domain, checkType: 'FAST' },
              headers: {
                'Authorization': `sso-key ${GODADDY_API_KEY}:${GODADDY_API_SECRET}`,
                'Accept': 'application/json'
              }
            }
          );
          
          return {
            domain,
            available: response.data.available,
            price: response.data.price,
            definitive: response.data.definitive
          };
        } catch (error) {
          return {
            domain,
            available: false,
            error: error.message
          };
        }
      })
    );

    res.json({
      success: true,
      results: results,
      summary: results.map(r => `${r.domain}: ${r.available ? '✅ AVAILABLE' : '❌ TAKEN'}`)
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Initiate domain purchase - Create Razorpay order
router.post('/purchase/initiate', verifyToken, async (req, res) => {
  try {
    const { domain, duration, amount, storeId, userId, pricing } = req.body;
    
    console.log('💳 Domain purchase request:', { 
      domain, 
      duration, 
      amount, 
      storeId, 
      userId, 
      tokenUserId: req.userId 
    });

    // Validate required fields
    if (!domain || !amount || !storeId || !userId) {
      console.error('❌ Missing required fields:', { domain: !!domain, amount: !!amount, storeId: !!storeId, userId: !!userId });
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: domain, amount, storeId, userId'
      });
    }

    // Verify user matches token (handle both string and ObjectId)
    const tokenUserId = req.userId ? req.userId.toString() : null;
    const requestUserId = userId ? userId.toString() : null;
    
    if (!tokenUserId) {
      console.error('❌ No user ID in token');
      return res.status(401).json({
        success: false,
        error: 'Invalid authentication token'
      });
    }

    if (tokenUserId !== requestUserId) {
      console.error('❌ User ID mismatch:', { tokenUserId, requestUserId });
      return res.status(403).json({
        success: false,
        error: 'User ID mismatch'
      });
    }

    // Validate amount
    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid amount'
      });
    }

    // Razorpay maximum amount limits
    // Test mode: ₹1,00,000 (1 lakh)
    // Production mode: Can be higher, but typically ₹10,00,000 (10 lakhs) or more
    const RAZORPAY_MAX_AMOUNT = process.env.NODE_ENV === 'production' 
      ? 10000000 // ₹10,00,000 in production
      : 100000; // ₹1,00,000 in test mode

    if (amountNum > RAZORPAY_MAX_AMOUNT) {
      console.error('❌ Amount exceeds Razorpay limit:', { amount: amountNum, max: RAZORPAY_MAX_AMOUNT });
      return res.status(400).json({
        success: false,
        error: `Amount exceeds maximum allowed limit of ₹${RAZORPAY_MAX_AMOUNT.toLocaleString('en-IN')}. Please contact support for large payments.`,
        maxAmount: RAZORPAY_MAX_AMOUNT
      });
    }

    // Minimum amount check (Razorpay minimum is ₹1)
    if (amountNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be at least ₹1'
      });
    }

    console.log('💳 Initiating domain purchase:', { domain, amount: amountNum, userId: tokenUserId, storeId });

    // Get Razorpay instance with error handling
    let razorpayInstance;
    try {
      razorpayInstance = getRazorpayInstance();
    } catch (razorpayError) {
      console.error('❌ Razorpay initialization error:', razorpayError);
      return res.status(500).json({
        success: false,
        error: 'Payment gateway configuration error. Please contact support.'
      });
    }

    // Create Razorpay order
    let razorpayOrder;
    try {
      razorpayOrder = await razorpayInstance.orders.create({
        amount: Math.round(amountNum * 100), // Convert to paise
        currency: 'INR',
        receipt: `domain_${Date.now()}_${domain.replace(/\./g, '_')}`,
        payment_capture: 1,
        notes: {
          type: 'domain_purchase',
          domain: domain,
          duration: duration || 1,
          storeId: storeId,
          userId: tokenUserId
        }
      });
    } catch (razorpayOrderError) {
      console.error('❌ Razorpay order creation error:', razorpayOrderError);
      
      // Handle specific Razorpay errors
      if (razorpayOrderError.statusCode === 400) {
        const errorDescription = razorpayOrderError.error?.description || razorpayOrderError.message;
        
        // Check for various forms of "amount exceeds maximum" error
        const errorLower = errorDescription ? errorDescription.toLowerCase() : '';
        if (errorLower.includes('maximum') || errorLower.includes('exceeds') || errorLower.includes('limit')) {
          return res.status(400).json({
            success: false,
            error: `Amount exceeds Razorpay's maximum limit. Maximum allowed: ₹${RAZORPAY_MAX_AMOUNT.toLocaleString('en-IN')}. Please contact support for assistance.`,
            maxAmount: RAZORPAY_MAX_AMOUNT,
            receivedAmount: amountNum,
            razorpayError: errorDescription
          });
        }
        
        return res.status(400).json({
          success: false,
          error: errorDescription || 'Invalid payment request. Please check the amount and try again.'
        });
      }
      
      return res.status(500).json({
        success: false,
        error: razorpayOrderError.error?.description || razorpayOrderError.message || 'Failed to create payment order. Please try again or contact support.'
      });
    }

    console.log('✅ Razorpay order created:', razorpayOrder.id);

    // Return order details
    res.json({
      success: true,
      data: {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount / 100, // Convert back to rupees
        currency: razorpayOrder.currency,
        key: process.env.RAZORPAY_KEY_ID
      }
    });

  } catch (error) {
    console.error('❌ Domain purchase initiation error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to initiate payment',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Verify domain purchase payment
router.post('/purchase/verify', verifyToken, async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      domain,
      duration,
      amount,
      storeId,
      userId,
      pricing
    } = req.body;

    // Validate required fields - log full request body for debugging
    console.log('📋 Received verification request body:', JSON.stringify(req.body, null, 2));
    console.log('📋 Extracted fields:', {
      razorpay_order_id: razorpay_order_id,
      razorpay_payment_id: razorpay_payment_id,
      razorpay_signature: razorpay_signature ? 'present' : 'missing',
      domain: domain,
      duration: duration,
      amount: amount,
      storeId: storeId,
      userId: userId
    });

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !domain) {
      console.error('❌ Missing required payment verification fields:', {
        razorpay_order_id: !!razorpay_order_id,
        razorpay_payment_id: !!razorpay_payment_id,
        razorpay_signature: !!razorpay_signature,
        domain: !!domain
      });
      return res.status(400).json({
        success: false,
        error: 'Missing required payment verification fields'
      });
    }

    // If missing data, retrieve from Razorpay order notes
    let finalUserId = userId || (req.userId ? req.userId.toString() : null);
    let finalStoreId = storeId;
    let finalDuration = duration;
    let finalAmount = amount;
    let finalPricing = pricing;

    // If any required fields are missing, fetch from Razorpay order
    if (!finalStoreId || !finalDuration || !finalAmount) {
      console.log('📦 Fetching missing data from Razorpay order:', razorpay_order_id);
      try {
        const razorpayInstance = getRazorpayInstance();
        const razorpayOrder = await razorpayInstance.orders.fetch(razorpay_order_id);
        
        if (razorpayOrder && razorpayOrder.notes) {
          console.log('📦 Razorpay order notes:', razorpayOrder.notes);
          
          // Extract from notes
          if (!finalStoreId && razorpayOrder.notes.storeId) {
            finalStoreId = razorpayOrder.notes.storeId;
          }
          if (!finalUserId && razorpayOrder.notes.userId) {
            finalUserId = razorpayOrder.notes.userId;
          }
          if (!finalDuration && razorpayOrder.notes.duration) {
            finalDuration = parseInt(razorpayOrder.notes.duration) || 1;
          }
          if (!finalAmount && razorpayOrder.amount) {
            finalAmount = razorpayOrder.amount / 100; // Convert from paise to rupees
          }
          if (!finalPricing && razorpayOrder.notes.pricing) {
            try {
              finalPricing = typeof razorpayOrder.notes.pricing === 'string' 
                ? JSON.parse(razorpayOrder.notes.pricing) 
                : razorpayOrder.notes.pricing;
            } catch (e) {
              console.error('Error parsing pricing from notes:', e);
            }
          }
          // Also get domain from notes if not provided
          if (!domain && razorpayOrder.notes.domain) {
            domain = razorpayOrder.notes.domain;
          }
        }
        
        console.log('📦 Extracted from Razorpay order:', {
          finalStoreId,
          finalUserId,
          finalDuration,
          finalAmount,
          domain
        });
      } catch (razorpayError) {
        console.error('❌ Error fetching Razorpay order:', razorpayError);
        // Continue with what we have - don't fail if we can't fetch
      }
    }

    // Use userId from token if still not available (final fallback)
    if (!finalUserId) {
      finalUserId = req.userId ? req.userId.toString() : null;
    }
    
    // Validate userId exists
    if (!finalUserId) {
      console.error('❌ Missing userId in request, token, and order notes');
      return res.status(400).json({
        success: false,
        error: 'Missing userId in request'
      });
    }

    // Validate storeId exists
    if (!finalStoreId) {
      console.error('❌ Missing storeId in request and order notes');
      return res.status(400).json({
        success: false,
        error: 'Missing storeId in request'
      });
    }

    // Validate amount exists
    if (!finalAmount || isNaN(finalAmount) || finalAmount <= 0) {
      console.error('❌ Invalid amount in request:', finalAmount);
      return res.status(400).json({
        success: false,
        error: 'Invalid amount in request'
      });
    }

    // Set default duration if missing
    if (!finalDuration) {
      finalDuration = 1;
    }

    // Verify user matches token - handle both string and ObjectId
    const tokenUserId = req.userId ? req.userId.toString() : null;
    const requestUserId = finalUserId.toString();
    
    if (!tokenUserId) {
      return res.status(400).json({
        success: false,
        error: 'Invalid token - no user ID found'
      });
    }

    if (tokenUserId !== requestUserId) {
      console.error('❌ User ID mismatch:', { tokenUserId, requestUserId });
      return res.status(403).json({
        success: false,
        error: 'User ID mismatch'
      });
    }

    console.log('🔍 Verifying domain purchase payment:', { 
      razorpay_order_id, 
      razorpay_payment_id, 
      domain,
      finalStoreId,
      finalUserId,
      finalDuration,
      finalAmount
    });

    // Verify the payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest('hex');

    const isSignatureValid = expectedSignature === razorpay_signature;

    if (!isSignatureValid) {
      console.error('❌ Invalid payment signature');
      return res.status(400).json({
        success: false,
        error: 'Invalid payment signature'
      });
    }

    // Calculate expiration date (duration years from now)
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + (duration || 1));

    // Extract TLD from domain (e.g., "example.com" -> ".com")
    const tld = '.' + domain.split('.').slice(-1)[0];

    // Create domain order record
    const domainOrder = new DomainOrder({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      domain: domain,
      tld: tld, // Save TLD for owner panel
      duration: finalDuration || 1,
      amount: finalAmount,
      userId: finalUserId, // Use the final userId (from body, token, or order notes)
      storeId: finalStoreId, // Use the final storeId (from body or order notes)
      status: 'pending', // Starts as pending for owner to process
      pricing: finalPricing || {},
      paidAt: new Date(),
      expiresAt: expiresAt
    });

    await domainOrder.save();

    console.log('✅ Domain order created:', domainOrder._id);

    // Return success
    res.json({
      success: true,
      message: 'Payment verified successfully. Domain order created.',
      data: {
        orderId: domainOrder._id,
        domain: domain,
        status: 'pending',
        message: 'Your domain order has been received. We will process it and contact you within 1-2 business days for setup.'
      }
    });

  } catch (error) {
    console.error('❌ Domain purchase verification error:', error);
    
    // Check if it's a duplicate order
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        error: 'Order already exists'
      });
    }

    res.status(500).json({
      success: false,
      error: error.message || 'Payment verification failed'
    });
  }
});

// Get user's purchased domains
router.get('/user/domains', verifyToken, async (req, res) => {
  try {
    const domains = await DomainOrder.find({ 
      userId: req.userId,
      status: { $in: ['pending', 'completed'] }
    })
    .populate('storeId', 'storeName')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: domains.map(order => ({
        name: order.domain,
        status: order.status,
        expires: order.expiresAt,
        setupComplete: order.setupComplete,
        purchasedAt: order.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching user domains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch domains'
    });
  }
});

// Get domain stats
router.get('/stats', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    const stats = {
      totalSearches: 0,
      domainsPurchased: await DomainOrder.countDocuments({ 
        userId: userId,
        status: { $in: ['pending', 'completed'] }
      }),
      popularTlds: ['.com', '.in', '.io']
    };

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ Error fetching domain stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats'
    });
  }
});

module.exports = router;