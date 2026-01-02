const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const axios = require('axios');

// Google OAuth callback route
router.get('/google/callback',
  passport.authenticate('google', { 
    failureRedirect: '/login',
    failureMessage: true 
  }),
  async (req, res) => {
    try {
      console.log('✅ Google OAuth successful for user:', req.user.email);
      
      // Generate JWT token
      const token = jwt.sign(
        {
          userId: req.user._id,
          email: req.user.email,
          role: req.user.role,
          name: req.user.name
        },
        process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
        { expiresIn: '7d' }
      );
      
      // Redirect to frontend with token
      res.redirect(`http://localhost:3000/auth/google/callback?token=${token}&success=true&user=${encodeURIComponent(JSON.stringify({
        id: req.user._id,
        email: req.user.email,
        name: req.user.name,
        role: req.user.role,
        hasStore: req.user.hasStore || false,
        storeId: req.user.storeId || null,
        storeSlug: req.user.storeSlug || null
      }))}`);
      
    } catch (error) {
      console.error('Google callback error:', error);
      res.redirect(`http://localhost:3000/login?error=${encodeURIComponent('Google authentication failed')}`);
    }
  }
);

// Alternative: Google OAuth with code flow (for your Register.jsx implementation)
router.post('/google/token', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({
        success: false,
        error: 'Authorization code is required'
      });
    }
    
    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || '233054564282-9bkk084dbqombdtinrbpdn9utmd1636k.apps.googleusercontent.com',
      client_secret: process.env.GOOGLE_CLIENT_SECRET || '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',
      redirect_uri: 'http://localhost:3000/auth/google/callback',
      grant_type: 'authorization_code'
    });
    
    const { access_token, id_token } = tokenResponse.data;
    
    // Get user info from Google
    const userInfoResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });
    
    const userInfo = userInfoResponse.data;
    console.log('Google user info:', userInfo);
    
    // Check if user exists in your database
    let user = await User.findOne({ email: userInfo.email });
    
    if (!user) {
      // Create new user
      user = await User.create({
        name: userInfo.name || userInfo.email.split('@')[0],
        email: userInfo.email,
        googleId: userInfo.sub,
        avatar: userInfo.picture,
        emailVerified: userInfo.email_verified || true,
        role: 'user',
        hasStore: false
      });
      console.log('✅ New user created via Google OAuth');
    } else {
      // Update existing user with Google info
      user.googleId = userInfo.sub;
      user.avatar = userInfo.picture;
      user.emailVerified = userInfo.email_verified || true;
      await user.save();
      console.log('✅ Existing user updated with Google info');
    }
    
    // Generate JWT token
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
        name: user.name
      },
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasStore: user.hasStore || false,
        storeId: user.storeId || null,
        storeSlug: user.storeSlug || null,
        avatar: user.avatar
      }
    });
    
  } catch (error) {
    console.error('Google token exchange error:', error.response?.data || error.message);
    res.status(400).json({
      success: false,
      error: 'Google authentication failed',
      details: error.response?.data || error.message
    });
  }
});

// Simple Google OAuth login route
router.get('/google', (req, res, next) => {
  const returnTo = req.query.returnTo || '/dashboard';
  
  // Store return URL in session
  req.session.returnTo = returnTo;
  
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    prompt: 'select_account' // Always show account selector
  })(req, res, next);
});

module.exports = router;