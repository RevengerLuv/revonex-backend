// server/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { auth } = require('../middleware/auth');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

// @route   POST /api/auth/register
// @desc    Register user
router.post('/register', authController.register);

// @route   POST /api/auth/login
// @desc    Login user
router.post('/login', authController.login);

// @route   GET /api/auth/me
// @desc    Get current user
router.get('/me', auth, authController.getMe);

// @route   POST /api/auth/logout
// @desc    Logout user
router.post('/logout', auth, authController.logout);

// @route   POST /api/auth/refresh-token
// @desc    Refresh access token
router.post('/refresh-token', authController.refreshToken);

// Google OAuth Routes - Only if configured
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

  router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/login' }),
    (req, res) => {
      // Successful authentication, redirect home
      res.redirect('https://revonex.store/');
    }
  );
} else {
  console.log('⚠️ Google OAuth routes not configured - GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET not set');
}

// Add this route at the top of your auth routes
router.post('/test-login', (req, res) => {
  console.log('🧪 Test login called with:', req.body);
  
  const { email, password } = req.body;
  
  // Simple validation
  if (!email || !password) {
    return res.status(400).json({
      success: false,
      error: 'Email and password required'
    });
  }
  
  // Return a predictable response structure
  res.json({
    success: true,
    token: 'test-token-' + Date.now(),
    user: {
      id: 'test-user-id',
      name: 'Test User',
      email: email,
      role: 'user',
      subscription: {
        plan: 'free',
        planName: 'Free',
        price: 0,
        status: 'active',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      }
    }
  });
});
// Add this route for debugging
router.post('/debug-login', async (req, res) => {
  console.log('🧪 DEBUG LOGIN called with:', req.body.email);
  
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password required'
      });
    }
    
    // Find user WITHOUT auth middleware
    const User = require('../models/User');
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      console.log('❌ User not found');
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }
    
    console.log('✅ User found:', {
      id: user._id,
      email: user.email,
      role: user.role,
      hasPassword: !!user.password,
      isActive: user.isActive,
      isBanned: user.isBanned
    });
    
    // Check password
    const bcrypt = require('bcryptjs');
    const isValid = await bcrypt.compare(password, user.password);
    
    console.log('🔑 Password check:', isValid ? 'VALID' : 'INVALID');
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid password'
      });
    }
    
    // Generate token
    const jwt = require('jsonwebtoken');
    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback-secret',
      { expiresIn: '24h' }
    );
    
    res.json({
      success: true,
      message: 'Debug login successful',
      token: token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar
      }
    });
    
  } catch (error) {
    console.error('Debug login error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
module.exports = router;