const User = require('../models/User');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');

// Get admin dashboard stats
exports.getAdminStats = async (req, res) => {
  try {
    const [
      totalStores,
      totalUsers,
      activeOrders,
      recentStores
    ] = await Promise.all([
      Store.countDocuments(),
      User.countDocuments(),
      Order.countDocuments({ status: { $in: ['pending', 'processing', 'shipped'] } }),
      Store.find().sort({ createdAt: -1 }).limit(5).populate('owner', 'name email')
    ]);

    res.json({
      totalStores,
      totalUsers,
      activeOrders,
      recentStores
    });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Get all stores for admin
exports.getAllStores = async (req, res) => {
  try {
    const stores = await Store.find()
      .populate('owner', 'name email')
      .sort({ createdAt: -1 });

    res.json(stores);
  } catch (error) {
    console.error('Error fetching stores:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user role (admin only)
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    // Prevent making owner accounts
    if (role === 'owner') {
      return res.status(403).json({ message: 'Cannot assign owner role' });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User role updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user role:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update user plan (admin only)
exports.updateUserPlan = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, planName, price } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      {
        'subscription.planId': planId,
        'subscription.planName': planName,
        'subscription.price': price,
        'subscription.status': 'active',
        'subscription.startDate': new Date()
      },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      message: 'User plan updated successfully',
      user
    });
  } catch (error) {
    console.error('Error updating user plan:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
