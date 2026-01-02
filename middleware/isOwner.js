const User = require('../models/User');

const isOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    
    // Check if user is admin/owner
    if (!user || (user.role !== 'admin' && user.role !== 'owner')) {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Admin/Owner privileges required.'
      });
    }
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

module.exports = isOwner;