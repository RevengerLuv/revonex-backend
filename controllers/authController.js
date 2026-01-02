// server/controllers/authController.js - UPDATED
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Simple token generation - UPDATED
const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET || 'test-secret-123',
    { expiresIn: '7d' }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { 
      userId: user._id,
      email: user.email,
      role: user.role
    },
    process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'test-refresh-123',
    { expiresIn: '30d' }
  );
};

module.exports = {
  // Get current user - UPDATED
  getMe: async (req, res) => {
    try {
      console.log('👤 GetMe called for user ID:', req.userId);
      
      // Use req.user from middleware (already populated)
      const user = req.user || await User.findById(req.userId);
      
      if (!user) {
        console.log('❌ User not found in getMe');
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      // Ensure subscription exists
      if (!user.subscription) {
        user.subscription = {
          plan: 'free',
          planName: 'Free',
          price: 0,
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          billingCycle: 'monthly',
          features: []
        };
        await user.save();
      }

      console.log('✅ User found:', user.email);
      console.log('📊 Subscription:', user.subscription);

      res.json({
        success: true,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          subscription: user.subscription,
          stats: user.stats,
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to fetch user data'
      });
    }
  },

  // Login user - UPDATED
  login: async (req, res) => {
    try {
      const { email, password } = req.body;

      console.log('🔐 Login attempt for:', email);

      // Find user with password
      const user = await User.findOne({ email }).select('+password');

      if (!user) {
        console.log('❌ User not found:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Check password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        console.log('❌ Invalid password for:', email);
        return res.status(401).json({
          success: false,
          error: 'Invalid credentials'
        });
      }

      // Generate tokens
      const token = generateToken(user);
      const refreshToken = generateRefreshToken(user);

      // Update user
      user.lastLogin = new Date();
      await user.save();

      // Remove password from response
      user.password = undefined;

      console.log('✅ Login successful for:', email);
      console.log('🎫 Token generated');

      res.json({
        success: true,
        message: 'Login successful',
        token: token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          subscription: user.subscription || {
            plan: 'free',
            planName: 'Free',
            price: 0,
            status: 'active'
          },
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({
        success: false,
        error: 'Login failed: ' + error.message
      });
    }
  },

  // Refresh token - UPDATED
  refreshToken: async (req, res) => {
    try {
      const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

      if (!refreshToken) {
        return res.status(401).json({
          success: false,
          error: 'Refresh token required'
        });
      }

      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET || 'test-refresh-123');

      const user = await User.findById(decoded.userId);
      if (!user) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token'
        });
      }

      const newAccessToken = generateToken(user);

      res.json({
        success: true,
        token: newAccessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          subscription: user.subscription || {
            plan: 'free',
            planName: 'Free',
            price: 0,
            status: 'active'
          }
        }
      });
    } catch (error) {
      console.error('Token refresh error:', error);
      res.status(401).json({
        success: false,
        error: 'Token refresh failed'
      });
    }
  },

  // Register user - UPDATED
  register: async (req, res) => {
    try {
      const { name, email, password } = req.body;

      console.log('📝 Registration attempt for:', email);

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'User with this email already exists'
        });
      }

      // Create user
      const user = await User.create({ name, email, password });

      // Generate token
      const token = generateToken(user);

      // Remove password from response
      user.password = undefined;

      console.log('✅ Registration successful for:', email);

      res.status(201).json({
        success: true,
        message: 'Registration successful!',
        token: token,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
          subscription: user.subscription || {
            plan: 'free',
            planName: 'Free',
            price: 0,
            status: 'active'
          },
          createdAt: user.createdAt
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        success: false,
        error: 'Registration failed: ' + error.message
      });
    }
  },

  // Logout
  logout: async (req, res) => {
    try {
      // Clear the refresh token cookie
      res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
      });
      
      res.json({
        success: true,
        message: 'Logged out successfully'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Logout failed'
      });
    }
  },

  // Mock other functions (keep as is)
  verifyEmail: async (req, res) => {
    res.json({ success: true, message: 'Email verified (mock)' });
  },

  forgotPassword: async (req, res) => {
    res.json({ success: true, message: 'Password reset email sent (mock)' });
  },

  resetPassword: async (req, res) => {
    res.json({ success: true, message: 'Password reset (mock)' });
  }
};