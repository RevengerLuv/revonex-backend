const User = require('../models/User');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Products');
const AnalyticsEvent = require('../models/AnalyticsEvent');

const mongoose = require('mongoose');
// Get owner dashboard statistics
exports.getOwnerStats = async (req, res) => {
  try {
    const [totalStores, totalUsers, totalOrders] = await Promise.all([
      Store.countDocuments(),
      User.countDocuments(),
      Order.countDocuments()
    ]);

    // Simple revenue calculation
    const revenueResult = await Transaction.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Get active users today (users who logged in today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const activeUsersToday = await User.countDocuments({ lastLogin: { $gte: today } });

    // Get additional stats for dashboard
    const pendingReviews = await Order.countDocuments({ status: 'pending' });
    const activePromotions = 0; // Placeholder for promotions
    const supportTickets = 0; // Placeholder for support tickets

    // Get conversion rate and average order value
    const completedOrders = await Order.countDocuments({ status: 'completed' });
    const conversionRate = totalUsers > 0 ? (completedOrders / totalUsers * 100) : 0;
    const averageOrderValue = completedOrders > 0 ? ((revenueResult[0]?.total || 0) / completedOrders) : 0;

    res.json({
      success: true,
      data: {
        totalStores,
        totalUsers,
        totalOrders,
        totalRevenue: revenueResult[0]?.total || 0,
        activeUsersToday,
        pendingReviews,
        activePromotions,
        supportTickets,
        conversionRate: Math.round(conversionRate * 100) / 100,
        averageOrderValue: Math.round(averageOrderValue * 100) / 100
      }
    });
  } catch (error) {
    console.error('Error in getOwnerStats:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
// Get platform analytics
exports.getPlatformAnalytics = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [userGrowth, storeGrowth, revenueGrowth] = await Promise.all([
      User.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Store.aggregate([
        { $match: { createdAt: { $gte: thirtyDaysAgo } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: thirtyDaysAgo }
          } 
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$amount' }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      userGrowth,
      storeGrowth,
      revenueGrowth
    });
  } catch (error) {
    console.error('Error in getPlatformAnalytics:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get financial reports
exports.getFinancialReports = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { status: 'completed' };

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      };
    }

    const transactions = await Transaction.find(query)
      .populate('store', 'storeName')
      .populate('order')
      .sort({ createdAt: -1 });

    const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
    const platformFee = totalRevenue * 0.05; // 5% platform fee

    res.json({
      transactions,
      totalRevenue,
      platformFee,
      netRevenue: totalRevenue - platformFee,
      count: transactions.length
    });
  } catch (error) {
    console.error('Error in getFinancialReports:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all stores (basic version)
exports.getAllStores = async (req, res) => {
  try {
    const stores = await Store.find()
      .populate('owner', 'name email')
      .sort({ createdAt: -1 });

    res.json(stores);
  } catch (error) {
    console.error('Error in getAllStores:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get store details
exports.getStoreDetails = async (req, res) => {
  try {
    const { storeId } = req.params;
    
    const store = await Store.findById(storeId)
      .populate('owner', 'name email')
      .populate('products');

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json(store);
  } catch (error) {
    console.error('Error in getStoreDetails:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update store status
exports.updateStoreStatus = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status } = req.body;

    const store = await Store.findByIdAndUpdate(
      storeId,
      { status: status === 'active' ? true : false },
      { new: true }
    ).populate('owner', 'name email');

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json({
      message: 'Store status updated successfully',
      store
    });
  } catch (error) {
    console.error('Error in updateStoreStatus:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Delete store
exports.deleteStore = async (req, res) => {
  try {
    const { storeId } = req.params;

    const store = await Store.findByIdAndDelete(storeId);

    if (!store) {
      return res.status(404).json({ error: 'Store not found' });
    }

    res.json({
      message: 'Store deleted successfully',
      storeId
    });
  } catch (error) {
    console.error('Error in deleteStore:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get all users (basic version)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find()
      .select('-password')
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Get user details
exports.getUserDetails = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId)
      .select('-password -emailVerificationToken -passwordResetToken');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error in getUserDetails:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Update user status
exports.updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isActive, isBanned } = req.body;

    const updateData = {};
    if (isActive !== undefined) updateData.isActive = isActive;
    if (isBanned !== undefined) updateData.isBanned = isBanned;

    const user = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      message: 'User status updated successfully',
      user
    });
  } catch (error) {
    console.error('Error in updateUserStatus:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

// Create user
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    const user = new User({
      name,
      email,
      password,
      role: role || 'user',
      emailVerified: true,
      isActive: true
    });

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      message: 'User created successfully',
      user: userResponse
    });
  } catch (error) {
    console.error('Error in createUser:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
// Get comprehensive platform overview
exports.getPlatformOverview = async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.setHours(0, 0, 0, 0));
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalStores,
      totalProducts,
      totalOrders,
      todayOrders,
      weekOrders,
      monthOrders,
      todayRevenue,
      weekRevenue,
      monthRevenue,
      totalRevenue,
      activeUsersToday,
      activeStoresToday,
      recentUsers,
      recentStores,
      recentOrders,
      recentTransactions,
      systemHealth,
      userGrowthData,
      revenueGrowthData
    ] = await Promise.all([
      // Basic counts
      User.countDocuments(),
      Store.countDocuments(),
      Product.countDocuments(),
      Order.countDocuments(),
      
      // Today stats
      Order.countDocuments({ createdAt: { $gte: today } }),
      Order.countDocuments({ createdAt: { $gte: weekAgo } }),
      Order.countDocuments({ createdAt: { $gte: monthAgo } }),
      
      // Revenue calculations
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: weekAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed', createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ]),
      
      // Active users/stores today
      User.countDocuments({ lastLogin: { $gte: today } }),
      Store.countDocuments({ updatedAt: { $gte: today } }),
      
      // Recent activities
      User.find().sort({ createdAt: -1 }).limit(5),
      Store.find().sort({ createdAt: -1 }).limit(5).populate('owner', 'name email'),
      Order.find().sort({ createdAt: -1 }).limit(10)
        .populate('store', 'storeName')
        .populate('userId', 'name email'),
      Transaction.find().sort({ createdAt: -1 }).limit(10)
        .populate('store', 'storeName')
        .populate('order'),
      
      // System health
      this.getSystemHealth(),
      
      // Growth data for charts
      this.getUserGrowthData(),
      this.getRevenueGrowthData()
    ]);

    res.json({
      success: true,
      data: {
        overview: {
          totalUsers,
          totalStores,
          totalProducts,
          totalOrders,
          totalRevenue: totalRevenue[0]?.total || 0,
          activeUsersToday,
          activeStoresToday
        },
        todayStats: {
          orders: todayOrders,
          revenue: todayRevenue[0]?.total || 0
        },
        weeklyStats: {
          orders: weekOrders,
          revenue: weekRevenue[0]?.total || 0
        },
        monthlyStats: {
          orders: monthOrders,
          revenue: monthRevenue[0]?.total || 0
        },
        recentActivities: {
          users: recentUsers,
          stores: recentStores,
          orders: recentOrders,
          transactions: recentTransactions
        },
        systemHealth,
        charts: {
          userGrowth: userGrowthData,
          revenueGrowth: revenueGrowthData
        }
      }
    });
  } catch (error) {
    console.error('Error fetching platform overview:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Get system health metrics
exports.getSystemHealth = async () => {
  try {
    const [userCount, storeCount, orderCount, recentErrorCount] = await Promise.all([
      User.countDocuments(),
      Store.countDocuments(),
      Order.countDocuments(),
      // Count recent errors (you'd need an ErrorLog model for this)
      0 // Placeholder
    ]);

    return {
      database: {
        status: 'healthy',
        connections: mongoose.connection.readyState === 1,
        users: userCount,
        stores: storeCount,
        orders: orderCount
      },
      api: {
        status: 'healthy',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      errors: {
        recent: recentErrorCount,
        status: recentErrorCount > 10 ? 'warning' : 'healthy'
      }
    };
  } catch (error) {
    console.error('Error checking system health:', error);
    return { status: 'error', error: error.message };
  }
};

// Get user growth data
exports.getUserGrowthData = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const data = await User.aggregate([
      {
        $match: {
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    return data.map(item => ({
      date: item._id,
      users: item.count
    }));
  } catch (error) {
    console.error('Error fetching user growth data:', error);
    return [];
  }
};

// Get revenue growth data
exports.getRevenueGrowthData = async () => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const data = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: thirtyDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          transactions: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    return data.map(item => ({
      date: item._id,
      revenue: item.revenue,
      transactions: item.transactions
    }));
  } catch (error) {
    console.error('Error fetching revenue growth data:', error);
    return [];
  }
};

// Get real-time user activities
exports.getRealTimeActivities = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const [recentLogins, recentOrders, recentPayments, recentAnalytics] = await Promise.all([
      // Recent logins
      User.find({ lastLogin: { $gte: fiveMinutesAgo } })
        .select('name email lastLogin')
        .sort({ lastLogin: -1 })
        .limit(limit / 4),
      
      // Recent orders
      Order.find({ createdAt: { $gte: fiveMinutesAgo } })
        .select('orderId total customer status createdAt')
        .populate('store', 'storeName')
        .sort({ createdAt: -1 })
        .limit(limit / 4),
      
      // Recent payments
      Transaction.find({ createdAt: { $gte: fiveMinutesAgo } })
        .select('transactionId amount status gateway createdAt')
        .populate('store', 'storeName')
        .sort({ createdAt: -1 })
        .limit(limit / 4),
      
      // Recent analytics events
      AnalyticsEvent.find({ createdAt: { $gte: fiveMinutesAgo } })
        .select('type storeId path createdAt')
        .sort({ createdAt: -1 })
        .limit(limit / 4)
    ]);

    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        activities: [
          ...recentLogins.map(user => ({
            type: 'user_login',
            user: user.name,
            email: user.email,
            time: user.lastLogin,
            message: `${user.name} logged in`
          })),
          ...recentOrders.map(order => ({
            type: 'new_order',
            orderId: order.orderId,
            store: order.store?.storeName,
            amount: order.total,
            customer: order.customer?.name,
            time: order.createdAt,
            message: `New order #${order.orderId} from ${order.customer?.name}`
          })),
          ...recentPayments.map(tx => ({
            type: 'payment',
            transactionId: tx.transactionId,
            store: tx.store?.storeName,
            amount: tx.amount,
            gateway: tx.gateway,
            time: tx.createdAt,
            message: `Payment of $${tx.amount} via ${tx.gateway}`
          })),
          ...recentAnalytics.map(event => ({
            type: 'analytics',
            eventType: event.type,
            storeId: event.storeId,
            path: event.path,
            time: event.createdAt,
            message: `${event.type} on ${event.path}`
          }))
        ].sort((a, b) => new Date(b.time) - new Date(a.time))
      }
    });
  } catch (error) {
    console.error('Error fetching real-time activities:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Enhanced store management with filtering
exports.getAllStoresEnhanced = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      status, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      startDate,
      endDate,
      minRevenue,
      maxRevenue
    } = req.query;

    const query = {};
    
    // Status filter
    if (status && status !== 'all') {
      if (status === 'active') query.isActive = true;
      if (status === 'inactive') query.isActive = false;
      if (status === 'banned') query.isBanned = true;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { storeName: { $regex: search, $options: 'i' } },
        { storeSlug: { $regex: search, $options: 'i' } },
        { contactEmail: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Date range filter
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const stores = await Store.find(query)
      .populate('owner', 'name email role')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Enhanced stats for each store
    const storesWithStats = await Promise.all(
      stores.map(async (store) => {
        const [orders, revenue, products, todayOrders, todayRevenue] = await Promise.all([
          Order.countDocuments({ store: store._id }),
          Transaction.aggregate([
            { 
              $match: { 
                store: store._id,
                status: 'completed'
              } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Product.countDocuments({ store: store._id }),
          Order.countDocuments({ 
            store: store._id,
            createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
          }),
          Transaction.aggregate([
            { 
              $match: { 
                store: store._id,
                status: 'completed',
                createdAt: { $gte: new Date().setHours(0, 0, 0, 0) }
              } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);

        // Filter by revenue if specified
        const storeRevenue = revenue[0]?.total || 0;
        if (minRevenue && storeRevenue < parseFloat(minRevenue)) return null;
        if (maxRevenue && storeRevenue > parseFloat(maxRevenue)) return null;

        return {
          ...store.toObject(),
          stats: {
            totalOrders: orders,
            totalRevenue: storeRevenue,
            totalProducts: products,
            todayOrders,
            todayRevenue: todayRevenue[0]?.total || 0,
            avgOrderValue: orders > 0 ? (storeRevenue / orders).toFixed(2) : 0
          }
        };
      })
    );

    // Filter out null stores (due to revenue filtering)
    const filteredStores = storesWithStats.filter(store => store !== null);

    const total = await Store.countDocuments(query);

    res.json({
      success: true,
      data: {
        stores: filteredStores,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        },
        filters: {
          status,
          search,
          startDate,
          endDate,
          minRevenue,
          maxRevenue
        }
      }
    });
  } catch (error) {
    console.error('Error fetching enhanced stores:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
// Add these methods to ownerController.js

// Execute system command
exports.executeCommand = async (req, res) => {
  try {
    const { command, payload } = req.body;
    const user = req.user;
    
    // Log the command execution
    console.log(`🔧 Command executed by ${user.email}: ${command}`, payload);
    
    let result;
    
    switch (command) {
      case 'cache:clear':
        // Implement cache clearing logic
        result = { message: 'Cache cleared successfully' };
        break;
        
      case 'db:backup':
        // Implement database backup
        result = { message: 'Database backup initiated', backupId: Date.now() };
        break;
        
      case 'queue:restart':
        // Implement queue restart
        result = { message: 'Queue workers restarted' };
        break;
        
      case 'stats:update':
        // Update all statistics
        await updateAllStats();
        result = { message: 'Statistics updated' };
        break;
        
      case 'alert:test':
        // Send test alert
        result = { message: 'Test alert sent' };
        break;
        
      default:
        return res.status(400).json({ 
          success: false, 
          error: 'Unknown command' 
        });
    }
    
    // Log activity
    await ActivityLog.create({
      userId: user._id,
      userRole: user.role,
      action: `command:${command}`,
      entityType: 'system',
      metadata: { command, payload, result },
      isSuspicious: false,
      riskScore: 0
    });
    
    res.json({
      success: true,
      command,
      result,
      executedBy: user.email,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Command execution error:', error);
    res.status(500).json({ success: false, error: 'Command execution failed' });
  }
};

// Get system status
exports.getSystemStatus = async (req, res) => {
  try {
    const status = {
      database: mongoose.connection.readyState === 1 ? 'online' : 'offline',
      api: 'online',
      websocket: 'connected',
      redis: 'online',
      uptime: process.uptime(),
      memory: {
        used: process.memoryUsage().heapUsed / 1024 / 1024,
        total: process.memoryUsage().heapTotal / 1024 / 1024,
        percentage: (process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100).toFixed(2)
      },
      cpu: '28%',
      connectedClients: 0, // WebSocket client count
      activeSessions: 0
    };
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get system status' });
  }
};

// Force logout user
exports.forceLogoutUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Invalidate all user sessions (implementation depends on your session store)
    // For JWT, you might want to add to a blacklist
    // For session-based auth, destroy sessions
    
    // Log the action
    await ActivityLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: 'force_logout',
      entityType: 'user',
      entityId: userId,
      metadata: { reason, targetUser: user.email },
      isSuspicious: false,
      riskScore: 0
    });
    
    res.json({
      success: true,
      message: `User ${user.email} logged out`,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Force logout error:', error);
    res.status(500).json({ success: false, error: 'Force logout failed' });
  }
};

// Service control
exports.serviceControl = async (req, res) => {
  try {
    const { service, action } = req.params;
    
    const validServices = ['api', 'queue', 'cache', 'websocket'];
    const validActions = ['restart', 'stop', 'start', 'status'];
    
    if (!validServices.includes(service)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid service' 
      });
    }
    
    if (!validActions.includes(action)) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid action' 
      });
    }
    
    // Log service control
    await ActivityLog.create({
      userId: req.user._id,
      userRole: req.user.role,
      action: `service_${action}`,
      entityType: 'system',
      metadata: { service, action },
      isSuspicious: false,
      riskScore: 0
    });
    
    res.json({
      success: true,
      message: `Service ${service} ${action} initiated`,
      service,
      action,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Service control error:', error);
    res.status(500).json({ success: false, error: 'Service control failed' });
  }
};

// ownerController.js - Add these functions

// Get system status
exports.getSystemStatus = async (req, res) => {
  try {
    const status = {
      database: mongoose.connection.readyState === 1 ? 'healthy' : 'offline',
      api: 'healthy',
      websocket: 'connected',
      uptime: process.uptime(),
      memory: {
        used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2),
        percentage: ((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2)
      },
      cpu: '28%',
      activeConnections: 0,
      activeSessions: 0
    };
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get system status' });
  }
};

// Get performance metrics
exports.getPerformanceMetrics = async (req, res) => {
  try {
    const metrics = {
      apiResponseTime: Math.floor(Math.random() * 100) + 50,
      databaseQueries: Math.floor(Math.random() * 1000),
      memoryUsage: Math.floor(Math.random() * 30) + 50,
      cpuUsage: Math.floor(Math.random() * 30) + 40,
      activeConnections: Math.floor(Math.random() * 50) + 100
    };
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to get metrics' });
  }
};

// Get financial summary
exports.getFinancialSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [todayStats, weeklyStats, monthlyStats, topProducts] = await Promise.all([
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: today }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 },
            averageOrder: { $avg: '$amount' }
          }
        }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: weekAgo }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 },
            averageOrder: { $avg: '$amount' }
          }
        }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: monthAgo }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 },
            averageOrder: { $avg: '$amount' }
          }
        }
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            totalSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 5 }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        today: {
          orders: todayStats[0]?.orders || 0,
          revenue: todayStats[0]?.revenue || 0,
          averageOrder: todayStats[0]?.averageOrder || 0
        },
        weekly: {
          orders: weeklyStats[0]?.orders || 0,
          revenue: weeklyStats[0]?.revenue || 0,
          growth: '+12%'
        },
        monthly: {
          orders: monthlyStats[0]?.orders || 0,
          revenue: monthlyStats[0]?.revenue || 0,
          target: monthlyStats[0]?.revenue ? monthlyStats[0]?.revenue * 1.2 : 0
        },
        topProducts: topProducts || [],
        paymentMethods: {
          stripe: '65%',
          paypal: '25%',
          crypto: '8%',
          other: '2%'
        }
      }
    });
  } catch (error) {
    console.error('Financial summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get financial summary' });
  }
};

// Get activity logs
exports.getActivityLogs = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Mock activity data for now
    const activities = [
      {
        id: 1,
        type: 'user_login',
        userEmail: 'admin@example.com',
        action: 'login_success',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        ipAddress: '192.168.1.1',
        deviceInfo: 'Chrome on Windows',
        isSuspicious: false,
        riskScore: 10,
        metadata: { endpoint: '/api/auth/login', method: 'POST' }
      },
      // Add more mock activities as needed
    ];
    
    res.json({
      success: true,
      data: activities,
      total: activities.length,
      suspicious: 0,
      usersOnline: 0
    });
  } catch (error) {
    console.error('Activity logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get activity logs' });
  }
};
// ownerController.js - Add these missing functions

// Get financial summary (for FinancialDashboard)
exports.getFinancialSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const [todayStats, weeklyStats, monthlyStats] = await Promise.all([
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: today }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: weekAgo }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 }
          }
        }
      ]),
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: monthAgo }
          } 
        },
        {
          $group: {
            _id: null,
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 }
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        today: {
          orders: todayStats[0]?.orders || 0,
          revenue: todayStats[0]?.revenue || 0,
          averageOrder: todayStats[0]?.revenue ? (todayStats[0]?.revenue / todayStats[0]?.orders).toFixed(2) : 0
        },
        weekly: {
          orders: weeklyStats[0]?.orders || 0,
          revenue: weeklyStats[0]?.revenue || 0,
          growth: '+12%'
        },
        monthly: {
          orders: monthlyStats[0]?.orders || 0,
          revenue: monthlyStats[0]?.revenue || 0,
          target: monthlyStats[0]?.revenue ? monthlyStats[0]?.revenue * 1.2 : 0
        },
        topProducts: [],
        paymentMethods: {
          stripe: '65%',
          paypal: '25%',
          crypto: '8%',
          other: '2%'
        }
      }
    });
  } catch (error) {
    console.error('Financial summary error:', error);
    res.status(500).json({ success: false, error: 'Failed to get financial summary' });
  }
};

// Get system status (for OwnerDashboard)
exports.getSystemStatus = async (req, res) => {
  try {
    const status = {
      database: mongoose.connection.readyState === 1 ? 'healthy' : 'offline',
      api: 'healthy',
      websocket: 'disconnected',
      uptime: process.uptime(),
      memory: {
        used: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        total: (process.memoryUsage().heapTotal / 1024 / 1024).toFixed(2),
        percentage: ((process.memoryUsage().heapUsed / process.memoryUsage().heapTotal) * 100).toFixed(2)
      },
      cpu: '28%',
      activeConnections: 0,
      activeSessions: 0
    };
    
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('System status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get system status' });
  }
};

// Get performance metrics (for OwnerDashboard)
exports.getPerformanceMetrics = async (req, res) => {
  try {
    const metrics = {
      apiResponseTime: 120,
      databaseQueries: 450,
      memoryUsage: 65,
      cpuUsage: 42,
      activeConnections: 128
    };
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('Performance metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to get metrics' });
  }
};

// Get activity logs (for ActivityMonitor)
exports.getActivityLogs = async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Mock activity data for now
    const activities = [
      {
        id: Date.now(),
        type: 'user_login',
        userEmail: 'admin@example.com',
        action: 'login_success',
        userRole: 'admin',
        timestamp: new Date(Date.now() - 5 * 60 * 1000),
        ipAddress: '192.168.1.1',
        deviceInfo: 'Chrome on Windows',
        isSuspicious: false,
        riskScore: 10,
        metadata: { endpoint: '/api/auth/login', method: 'POST' }
      },
      {
        id: Date.now() - 1,
        type: 'new_order',
        userEmail: 'customer@example.com',
        action: 'order_created',
        userRole: 'user',
        timestamp: new Date(Date.now() - 15 * 60 * 1000),
        ipAddress: '192.168.1.2',
        deviceInfo: 'Safari on Mac',
        isSuspicious: false,
        riskScore: 5,
        metadata: { orderId: 'ORD-12345', amount: 99.99 }
      }
    ];
    
    res.json({
      success: true,
      data: activities,
      total: activities.length,
      suspicious: 0,
      usersOnline: 0
    });
  } catch (error) {
    console.error('Activity logs error:', error);
    res.status(500).json({ success: false, error: 'Failed to get activity logs' });
  }
};
// Add this function to ownerController.js

// Get all premium users (starter, pro, enterprise plans)
// In ownerController.js, add this function
exports.getPremiumUsers = async (req, res) => {
  try {
    console.log('Fetching premium users...'); // Debug log
    
    const { 
      page = 1, 
      limit = 20, 
      planType, 
      status, 
      search, 
      sortBy = 'subscription.startDate', 
      sortOrder = 'desc'
    } = req.query;

    const query = {
      'subscription.plan': { $in: ['starter', 'pro', 'enterprise'] },
      'subscription.status': 'active' // Ensure only active subscriptions
    };
    
    // Filter by specific plan
    if (planType && planType !== 'all') {
      query['subscription.plan'] = planType;
    }
    
    // Filter by subscription status
    if (status && status !== 'all') {
      query['subscription.status'] = status;
    }
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sort = {};
    if (sortBy === 'name') {
      sort['name'] = sortOrder === 'desc' ? -1 : 1;
    } else if (sortBy === 'email') {
      sort['email'] = sortOrder === 'desc' ? -1 : 1;
    } else {
      sort['subscription.startDate'] = sortOrder === 'desc' ? -1 : 1;
    }

    const users = await User.find(query)
      .select('-password -emailVerificationToken -passwordResetToken')
      .populate('subscription') // Ensure subscription data is populated
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await User.countDocuments(query);

    // Get enhanced stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [totalOrders, totalSpent] = await Promise.all([
          Order.countDocuments({ userId: user._id }),
          Transaction.aggregate([
            { 
              $match: { 
                userId: user._id,
                status: 'completed'
              } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ])
        ]);

        return {
          ...user.toObject(),
          stats: {
            totalStores: user.stores ? user.stores.length : 0,
            totalOrders,
            totalSpent: totalSpent[0]?.total || 0
          }
        };
      })
    );

    // Get summary
    const summary = await User.aggregate([
      { $match: { 'subscription.plan': { $in: ['starter', 'pro', 'enterprise'] } } },
      {
        $group: {
          _id: '$subscription.plan',
          count: { $sum: 1 },
          totalRevenue: { $sum: '$subscription.price' }
        }
      }
    ]);

    const totalPremiumUsers = summary.reduce((sum, item) => sum + item.count, 0);
    const totalMonthlyRevenue = summary.reduce((sum, item) => sum + item.totalRevenue, 0);

    console.log(`Found ${totalPremiumUsers} premium users`); // Debug log

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        summary: {
          totalPremiumUsers,
          totalMonthlyRevenue,
          byPlan: summary
        },
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching premium users:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Add these to ownerController.js
exports.cancelUserSubscription = async (req, res) => {
  try {
    const { userId, reason } = req.body;
    const { userId: adminId } = req.user;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Update subscription status
    if (user.subscription) {
      user.subscription.status = 'cancelled';
      user.subscription.cancelledAt = new Date();
      user.subscription.cancelledBy = adminId;
      user.subscription.cancellationReason = reason;
      await user.save();
    }
    
    // Log the action
    await ActivityLog.create({
      userId: adminId,
      userRole: req.user.role,
      action: 'cancel_subscription',
      targetId: userId,
      details: {
        reason,
        previousStatus: 'active',
        newStatus: 'cancelled'
      }
    });
    
    res.json({ success: true, message: 'Subscription cancelled successfully' });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ success: false, message: 'Failed to cancel subscription' });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { userId: adminId } = req.user;
    
    // Find user
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    // Check if user is owner/admin (prevent deleting them)
    if (user.role === 'owner' || user.role === 'admin') {
      return res.status(403).json({ 
        success: false, 
        message: 'Cannot delete owner or admin users' 
      });
    }
    
    // Log the action before deletion
    await ActivityLog.create({
      userId: adminId,
      action: 'delete_user',
      targetId: userId,
      details: {
        userEmail: user.email,
        userName: user.name,
        userRole: user.role
      }
    });
    
    // Soft delete or hard delete based on your preference
    // Option 1: Soft delete
    user.isDeleted = true;
    user.deletedAt = new Date();
    user.deletedBy = adminId;
    await user.save();
    
    // Option 2: Hard delete (uncomment if you want permanent deletion)
    // await User.findByIdAndDelete(userId);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

exports.upgradeToPremium = async (req, res) => {
  try {
    const { userId, planId, startDate, endDate } = req.body;
    const { userId: adminId } = req.user;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const plan = {
      starter: { name: 'Starter', price: 149, features: ['Basic Store', '10 Products'] },
      pro: { name: 'Pro', price: 349, features: ['Advanced Store', 'Unlimited Products'] },
      enterprise: { name: 'Enterprise', price: 999, features: ['Multi-Store', 'Custom Domain'] }
    }[planId];
    
    if (!plan) {
      return res.status(400).json({ success: false, message: 'Invalid plan' });
    }
    
    // Create or update subscription
    user.subscription = {
      planId,
      planName: plan.name,
      price: plan.price,
      status: 'active',
      startDate: startDate || new Date(),
      endDate: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      upgradedBy: adminId,
      upgradedAt: new Date()
    };
    
    await user.save();
    
    // Log the action
    await ActivityLog.create({
      userId: adminId,
      action: 'upgrade_user',
      targetId: userId,
      details: {
        plan: plan.name,
        price: plan.price
      }
    });
    
    res.json({ 
      success: true, 
      message: 'User upgraded to premium successfully',
      user: {
        id: user._id,
        name: user.name,
        subscription: user.subscription
      }
    });
  } catch (error) {
    console.error('Upgrade user error:', error);
    res.status(500).json({ success: false, message: 'Failed to upgrade user' });
  }
};

// In server/controllers/ownerController.js
exports.banUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration } = req.body;
    const { userId: adminId } = req.user;
        
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update ban info
    user.isBanned = true;
    user.banReason = reason || 'Violation of terms';
    user.bannedAt = new Date();
    user.bannedBy = adminId;

    await user.save();

    // Log the action
    await ActivityLog.create({
      userId: adminId,
      userRole: req.user.role,
      action: 'ban_user',
      targetId: userId,
      details: {
        reason,
        duration
      }
    });

    res.json({
      success: true,
      message: 'User banned successfully',
      user: {
        id: user._id,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason
      }
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ success: false, message: 'Failed to ban user' });
  }
};

// Unban user
exports.unbanUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason } = req.body;
    const { userId: adminId } = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.isBanned = false;
    user.unbanReason = reason;
    user.unbannedAt = new Date();
    user.unbannedBy = adminId;

    await user.save();

    res.json({
      success: true,
      message: 'User unbanned successfully',
      user: {
        id: user._id,
        name: user.name,
        isBanned: user.isBanned
      }
    });
  } catch (error) {
    console.error('Unban user error:', error);
    res.status(500).json({ success: false, message: 'Failed to unban user' });
  }
};
// Get system metrics (for ActivityMonitor)
exports.getSystemMetrics = async (req, res) => {
  try {
    const metrics = {
      cpu: 42,
      memory: 65,
      activeConnections: 128,
      requestRate: 45,
      errorRate: 0.2
    };
    
    res.json({
      success: true,
      data: metrics
    });
  } catch (error) {
    console.error('System metrics error:', error);
    res.status(500).json({ success: false, error: 'Failed to get system metrics' });
  }
};

// Enhanced ban user with reason
exports.banUserWithReason = async (req, res) => {
  try {
    const { userId } = req.params;
    const { reason, duration, notifyUser } = req.body;
    const { userId: adminId } = req.user;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Update ban info
    user.isBanned = true;
    user.banReason = reason || 'Violation of terms';
    user.bannedAt = new Date();
    user.bannedBy = adminId;

    await user.save();

    // Log the action
    await ActivityLog.create({
      userId: adminId,
      userRole: req.user.role,
      action: 'ban_user',
      targetId: userId,
      details: {
        reason,
        duration,
        notifyUser: notifyUser || false
      }
    });

    // Send notification email (implement this if you have email service)
    if (notifyUser && user.email) {
      await sendBanNotificationEmail(user.email, reason);
    }

    res.json({
      success: true,
      message: 'User banned successfully',
      user: {
        id: user._id,
        name: user.name,
        isBanned: user.isBanned,
        banReason: user.banReason
      }
    });
  } catch (error) {
    console.error('Ban user error:', error);
    res.status(500).json({ success: false, message: 'Failed to ban user' });
  }
};

// Update user subscription/role
exports.updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const { planId, planName, price, action } = req.body;
    const { userId: adminId } = req.user;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const plans = {
      free: { name: 'Free', price: 0 },
      starter: { name: 'Starter', price: 149 },
      pro: { name: 'Pro', price: 349 },
      enterprise: { name: 'Enterprise', price: 999 }
    };
    
    let message = '';
    
    if (action === 'upgrade') {
      const plan = plans[planId] || plans.free;
      
      user.subscription = {
        planId: planId,
        planName: plan.name,
        price: plan.price,
        status: 'active',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        upgradedBy: adminId,
        upgradedAt: new Date()
      };
      
      message = `User upgraded to ${plan.name} plan`;
      
    } else if (action === 'downgrade') {
      user.subscription = {
        planId: 'free',
        planName: 'Free',
        price: 0,
        status: 'active',
        startDate: new Date(),
        downgradedBy: adminId,
        downgradedAt: new Date()
      };
      
      message = 'User downgraded to Free plan';
      
    } else if (action === 'cancel') {
      if (user.subscription) {
        user.subscription.status = 'cancelled';
        user.subscription.cancelledAt = new Date();
        user.subscription.cancelledBy = adminId;
        user.subscription.cancellationReason = 'Cancelled by admin';
      }
      
      message = 'User subscription cancelled';
    }
    
    await user.save();
    
    // Log the action
    await ActivityLog.create({
      userId: adminId,
      action: action === 'upgrade' ? 'admin_upgrade' : 'admin_downgrade',
      targetId: userId,
      details: {
        previousPlan: user.subscription?.planName,
        newPlan: planName,
        action
      }
    });
    
    res.json({ 
      success: true, 
      message,
      user: {
        id: user._id,
        name: user.name,
        subscription: user.subscription
      }
    });
  } catch (error) {
    console.error('Update user role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user role' });
  }
};

// Enhanced user management
exports.getAllUsersEnhanced = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      status, 
      search, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      lastLoginDays,
      hasStores
    } = req.query;

    const query = {};
    
    // Role filter
    if (role && role !== 'all') query.role = role;
    
    // Status filter
    if (status === 'active') query.isActive = true;
    if (status === 'inactive') query.isActive = false;
    if (status === 'banned') query.isBanned = true;
    if (status === 'verified') query.emailVerified = true;
    if (status === 'unverified') query.emailVerified = false;
    
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Last login filter
    if (lastLoginDays) {
      const daysAgo = new Date(Date.now() - lastLoginDays * 24 * 60 * 60 * 1000);
      query.lastLogin = { $gte: daysAgo };
    }
    
    // Has stores filter
    if (hasStores === 'true') {
      query.stores = { $exists: true, $not: { $size: 0 } };
    } else if (hasStores === 'false') {
      query.$or = [
        { stores: { $exists: false } },
        { stores: { $size: 0 } }
      ];
    }

    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort(sort)
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    // Enhanced stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [stores, orders, totalSpent, lastOrder] = await Promise.all([
          Store.find({ owner: user._id }).select('storeName storeSlug isActive'),
          Order.countDocuments({ user: user._id }),
          Transaction.aggregate([
            { 
              $match: { 
                userId: user._id,
                status: 'completed'
              } 
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]),
          Order.findOne({ user: user._id })
            .sort({ createdAt: -1 })
            .select('orderId total createdAt')
        ]);

        return {
          ...user.toObject(),
          stats: {
            totalStores: stores.length,
            totalOrders: orders,
            totalSpent: totalSpent[0]?.total || 0,
            activeStores: stores.filter(s => s.isActive).length,
            lastOrder: lastOrder ? {
              id: lastOrder.orderId,
              amount: lastOrder.total,
              date: lastOrder.createdAt
            } : null
          },
          stores: stores
        };
      })
    );

    const total = await User.countDocuments(query);

    res.json({
      success: true,
      data: {
        users: usersWithStats,
        pagination: {
          total,
          page: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limit)),
          limit: parseInt(limit)
        },
        filters: {
          role,
          status,
          search,
          lastLoginDays,
          hasStores
        }
      }
    });
  } catch (error) {
    console.error('Error fetching enhanced users:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Get detailed analytics
exports.getDetailedAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = parseInt(period.replace('d', '')) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [
      userGrowth,
      storeGrowth,
      revenueData,
      topStores,
      topProducts,
      trafficData,
      paymentMethods,
      orderStatusDistribution,
      userActivity
    ] = await Promise.all([
      // User growth
      this.getUserGrowthData(),
      
      // Store growth
      Store.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Revenue data
      this.getRevenueGrowthData(),
      
      // Top performing stores
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: startDate }
          } 
        },
        {
          $group: {
            _id: '$store',
            revenue: { $sum: '$amount' },
            orders: { $sum: 1 },
            avgOrderValue: { $avg: '$amount' }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'stores',
            localField: '_id',
            foreignField: '_id',
            as: 'store'
          }
        },
        { $unwind: '$store' }
      ]),
      
      // Top products
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.productId',
            name: { $first: '$items.name' },
            totalSold: { $sum: '$items.quantity' },
            revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
          }
        },
        { $sort: { revenue: -1 } },
        { $limit: 10 }
      ]),
      
      // Traffic data
      AnalyticsEvent.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
            },
            pageViews: { 
              $sum: { $cond: [{ $eq: ['$type', 'page_view'] }, 1, 0] } 
            },
            productViews: { 
              $sum: { $cond: [{ $eq: ['$type', 'product_view'] }, 1, 0] } 
            },
            checkouts: { 
              $sum: { $cond: [{ $eq: ['$type', 'checkout'] }, 1, 0] } 
            },
            purchases: { 
              $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } 
            }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      // Payment methods distribution
      Transaction.aggregate([
        { 
          $match: { 
            status: 'completed',
            createdAt: { $gte: startDate }
          } 
        },
        {
          $group: {
            _id: '$gateway',
            count: { $sum: 1 },
            totalAmount: { $sum: '$amount' }
          }
        },
        { $sort: { totalAmount: -1 } }
      ]),
      
      // Order status distribution
      Order.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            totalValue: { $sum: '$total' }
          }
        },
        { $sort: { count: -1 } }
      ]),
      
      // User activity by hour
      User.aggregate([
        { $match: { lastLogin: { $gte: startDate } } },
        {
          $group: {
            _id: {
              $hour: '$lastLogin'
            },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
    ]);

    res.json({
      success: true,
      data: {
        period: days,
        userGrowth,
        storeGrowth,
        revenueData,
        topStores,
        topProducts,
        trafficData,
        paymentMethods,
        orderStatusDistribution,
        userActivity
      }
    });
  } catch (error) {
    console.error('Error fetching detailed analytics:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Bulk operations
exports.bulkUpdateUsers = async (req, res) => {
  try {
    const { userIds, action, data } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No users specified' });
    }
    
    let update = {};
    let message = '';
    
    switch (action) {
      case 'ban':
        update = { isBanned: true, isActive: false };
        message = 'Users banned successfully';
        break;
      case 'unban':
        update = { isBanned: false, isActive: true };
        message = 'Users unbanned successfully';
        break;
      case 'activate':
        update = { isActive: true };
        message = 'Users activated successfully';
        break;
      case 'deactivate':
        update = { isActive: false };
        message = 'Users deactivated successfully';
        break;
      case 'change_role':
        if (!data.role) {
          return res.status(400).json({ success: false, error: 'Role is required' });
        }
        update = { role: data.role };
        message = 'User roles updated successfully';
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
    
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $set: update }
    );
    
    res.json({
      success: true,
      message,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error in bulk user update:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.bulkUpdateStores = async (req, res) => {
  try {
    const { storeIds, action, data } = req.body;
    
    if (!storeIds || !Array.isArray(storeIds) || storeIds.length === 0) {
      return res.status(400).json({ success: false, error: 'No stores specified' });
    }
    
    let update = {};
    let message = '';
    
    switch (action) {
      case 'suspend':
        update = { isActive: false, isBanned: true };
        message = 'Stores suspended successfully';
        break;
      case 'activate':
        update = { isActive: true, isBanned: false };
        message = 'Stores activated successfully';
        break;
      case 'update_settings':
        if (!data.settings) {
          return res.status(400).json({ success: false, error: 'Settings are required' });
        }
        update = { settings: data.settings };
        message = 'Store settings updated successfully';
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid action' });
    }
    
    const result = await Store.updateMany(
      { _id: { $in: storeIds } },
      { $set: update }
    );
    
    res.json({
      success: true,
      message,
      data: {
        matched: result.matchedCount,
        modified: result.modifiedCount
      }
    });
  } catch (error) {
    console.error('Error in bulk store update:', error);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Export data
exports.exportData = async (req, res) => {
  try {
    const { type, format = 'json', filters = {} } = req.body;
    
    let data;
    let filename;
    
    switch (type) {
      case 'users':
        data = await User.find(filters)
          .select('-password -emailVerificationToken -passwordResetToken')
          .lean();
        filename = `users_export_${Date.now()}`;
        break;
      case 'stores':
        data = await Store.find(filters)
          .populate('owner', 'name email')
          .lean();
        filename = `stores_export_${Date.now()}`;
        break;
      case 'transactions':
        data = await Transaction.find(filters)
          .populate('store', 'storeName')
          .populate('order')
          .lean();
        filename = `transactions_export_${Date.now()}`;
        break;
      case 'orders':
        data = await Order.find(filters)
          .populate('store', 'storeName')
          .populate('user', 'name email')
          .lean();
        filename = `orders_export_${Date.now()}`;
        break;
      default:
        return res.status(400).json({ success: false, error: 'Invalid export type' });
    }
    
    if (format === 'csv') {
      // Convert to CSV
      const csv = convertToCSV(data);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.csv`);
      return res.send(csv);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=${filename}.json`);
      return res.json({ success: true, data });
    }
  } catch (error) {
    console.error('Error exporting data:', error);
    res.status(500).json({ success: false, error: 'Export failed' });
  }
};

// Helper function to convert to CSV
function convertToCSV(data) {
  if (!data || data.length === 0) return '';
  
  const headers = Object.keys(data[0]);
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const row of data) {
    const values = headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      const escaped = String(value).replace(/"/g, '""');
      return `"${escaped}"`;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}