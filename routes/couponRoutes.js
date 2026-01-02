// server/routes/couponRoutes.js
const express = require('express');
const router = express.Router();
const Coupon = require('../models/Coupon');
const { auth } = require('../middleware/auth');

// ========== PUBLIC ROUTES (No auth required) ==========

// POST /api/coupons/validate - Public coupon validation
router.post('/validate', async (req, res) => {
  try {
    console.log('🎫 Public coupon validation request:', {
      storeId: req.body.storeId,
      code: req.body.code,
      cartTotal: req.body.cartTotal
    });

    const { storeId, code, cartTotal } = req.body;

    // Validate required fields
    if (!storeId || !code || cartTotal === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Store ID, coupon code, and cart total are required'
      });
    }

    // Find active coupon
    const coupon = await Coupon.findOne({
      store: storeId,
      code: code.toUpperCase().trim(),
      isActive: true
    });

    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Invalid coupon code'
      });
    }

    // Check expiration
    if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Coupon has expired'
      });
    }

    // Check usage limit
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        error: 'Coupon usage limit reached'
      });
    }

    // Check minimum purchase
    if (cartTotal < coupon.minPurchase) {
      return res.status(400).json({
        success: false,
        error: `Minimum purchase of $${coupon.minPurchase} required`
      });
    }

    // Calculate discount
    let discountAmount = 0;
    
    if (coupon.discountType === 'percentage') {
      discountAmount = (cartTotal * coupon.discountValue) / 100;
      
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
        discountAmount = coupon.maxDiscount;
      }
    } else {
      discountAmount = coupon.discountValue;
    }

    // Don't discount more than cart total
    if (discountAmount > cartTotal) {
      discountAmount = cartTotal;
    }

    const finalAmount = cartTotal - discountAmount;

    res.json({
      success: true,
      message: 'Coupon applied successfully',
      data: {
        coupon: {
          _id: coupon._id,
          code: coupon.code,
          name: coupon.name,
          discountType: coupon.discountType,
          discountValue: coupon.discountValue,
          minPurchase: coupon.minPurchase,
          maxDiscount: coupon.maxDiscount
        },
        discountAmount: parseFloat(discountAmount.toFixed(2)),
        finalAmount: parseFloat(finalAmount.toFixed(2)),
        cartTotal: parseFloat(cartTotal.toFixed(2))
      }
    });

  } catch (error) {
    console.error('❌ Coupon validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate coupon'
    });
  }
});

// ========== PROTECTED ROUTES (Auth required) ==========

// POST /api/coupons - Create new coupon
router.post('/', auth, async (req, res) => {
  try {
    console.log('📝 Creating coupon with data:', req.body);
    
    const {
      code,
      name,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscountAmount,
      usageLimit,
      validUntil,
      isActive,
      storeId
    } = req.body;

    // Validate required fields
    if (!code || !name || !storeId) {
      return res.status(400).json({
        success: false,
        error: 'Code, name, and storeId are required'
      });
    }

    // Check if coupon code already exists for this store
    const existingCoupon = await Coupon.findOne({ 
      store: storeId, 
      code: code.toUpperCase() 
    });

    if (existingCoupon) {
      return res.status(400).json({
        success: false,
        error: 'Coupon code already exists for this store'
      });
    }

    // Create new coupon
    const coupon = new Coupon({
      store: storeId,
      code: code.toUpperCase(),
      name,
      description: description || '',
      discountType: discountType || 'percentage',
      discountValue: discountValue || 10,
      minPurchase: minOrderAmount || 0,
      maxDiscount: maxDiscountAmount || null,
      usageLimit: usageLimit || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      isActive: isActive !== false,
      appliesTo: 'all'
    });

    await coupon.save();

    res.status(201).json({
      success: true,
      message: 'Coupon created successfully',
      data: coupon
    });
  } catch (error) {
    console.error('❌ Create coupon error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create coupon: ' + error.message
    });
  }
});

// GET /api/coupons/stores/:storeId/coupons - Get coupons by store
router.get('/stores/:storeId/coupons', auth, async (req, res) => {
  try {
    console.log('📋 Fetching coupons for store:', req.params.storeId);
    
    const coupons = await Coupon.find({ store: req.params.storeId })
      .sort({ createdAt: -1 });
    
    console.log(`✅ Found ${coupons.length} coupons`);
    
    res.json({ 
      success: true, 
      data: coupons 
    });
  } catch (err) {
    console.error('❌ Get coupons error:', err);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch coupons: ' + err.message 
    });
  }
});

// DELETE /api/coupons/:id - Delete coupon
router.delete('/:id', auth, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        error: 'Coupon not found'
      });
    }

    await coupon.deleteOne();

    res.json({
      success: true,
      message: 'Coupon deleted successfully'
    });
  } catch (error) {
    console.error('❌ Delete coupon error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete coupon: ' + error.message
    });
  }
});

module.exports = router;