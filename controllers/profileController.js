const User = require('../models/User');

const profileController = {
  // GET /api/profile
  async getProfile(req, res) {
    try {
      const user = await User.findById(req.user.id).select('-password');
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      res.json({
        success: true,
        user
      });
      
    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to get profile' 
      });
    }
  },

  // PUT /api/profile
  async updateProfile(req, res) {
    try {
      const { name, phone, businessInfo } = req.body;
      
      const user = await User.findById(req.user.id);
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // Update fields
      if (name) user.name = name;
      if (phone) user.phone = phone;
      if (businessInfo) user.businessInfo = businessInfo;
      
      await user.save();
      
      res.json({
        success: true,
        message: 'Profile updated successfully',
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone,
          businessInfo: user.businessInfo,
          subscription: user.subscription
        }
      });
      
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to update profile' 
      });
    }
  },

  // GET /api/profile/export
  async exportData(req, res) {
    try {
      const user = await User.findById(req.user.id).select('-password');
      
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          error: 'User not found' 
        });
      }
      
      // Get user's orders, stores, etc. (you'll need to add these)
      const data = {
        user: user.toObject(),
        // Add other data here
        exportedAt: new Date().toISOString()
      };
      
      res.json({
        success: true,
        data
      });
      
    } catch (error) {
      console.error('Export data error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to export data' 
      });
    }
  }
};

module.exports = profileController;