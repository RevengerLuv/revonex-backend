// [file name]: analyticsController.js
const Order = require('../models/Order');
const User = require('../models/User');
const Store = require('../models/Store');
const Transaction = require('../models/Transaction');
const ActivityLog = require('../models/ActivityLog');

// Get platform analytics
exports.getPlatformAnalytics = async (req, res) => {
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
      paymentMethods,
      orderStatusDistribution
    ] = await Promise.all([
      // User growth
      User.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
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
      Transaction.aggregate([
        {
          $match: {
            status: 'completed',
            createdAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            revenue: { $sum: '$amount' },
            transactions: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
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
      ])
    ]);
    
    res.json({
      success: true,
      data: {
        period: days,
        userGrowth: userGrowth.map(item => ({ date: item._id, users: item.count })),
        storeGrowth: storeGrowth.map(item => ({ date: item._id, stores: item.count })),
        revenueData: revenueData.map(item => ({ date: item._id, revenue: item.revenue, transactions: item.transactions })),
        topStores,
        topProducts,
        paymentMethods,
        orderStatusDistribution
      }
    });
  } catch (error) {
    console.error('Error getting platform analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get platform analytics'
    });
  }
};

// Get revenue analytics
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { period = '30d', groupBy = 'day' } = req.query;
    const days = parseInt(period.replace('d', '')) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    let dateFormat = '%Y-%m-%d';
    if (groupBy === 'week') dateFormat = '%Y-%U';
    if (groupBy === 'month') dateFormat = '%Y-%m';
    
    const revenueData = await Transaction.aggregate([
      {
        $match: {
          status: 'completed',
          createdAt: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: dateFormat, date: '$createdAt' }
          },
          revenue: { $sum: '$amount' },
          platformFee: { $sum: { $multiply: ['$amount', 0.05] } }, // 5% platform fee
          netRevenue: { $sum: { $multiply: ['$amount', 0.95] } },
          transactions: { $sum: 1 },
          avgTransactionValue: { $avg: '$amount' }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Calculate growth metrics
    const totalRevenue = revenueData.reduce((sum, item) => sum + item.revenue, 0);
    const totalPlatformFee = revenueData.reduce((sum, item) => sum + item.platformFee, 0);
    const totalNetRevenue = revenueData.reduce((sum, item) => sum + item.netRevenue, 0);
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalPlatformFee,
          totalNetRevenue,
          avgDailyRevenue: totalRevenue / days
        },
        timeSeries: revenueData,
        chartData: {
          labels: revenueData.map(item => item._id),
          revenue: revenueData.map(item => item.revenue),
          platformFee: revenueData.map(item => item.platformFee),
          netRevenue: revenueData.map(item => item.netRevenue)
        }
      }
    });
  } catch (error) {
    console.error('Error getting revenue analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get revenue analytics'
    });
  }
};

// Get conversion analytics
exports.getConversionAnalytics = async (req, res) => {
  try {
    const { period = '30d' } = req.query;
    const days = parseInt(period.replace('d', '')) || 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get user activities for funnel
    const activities = await ActivityLog.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate },
          action: { $in: ['page_view', 'product_view', 'add_to_cart', 'checkout_start', 'payment_success'] }
        }
      },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$userId' }
        }
      }
    ]);
    
    // Calculate funnel
    const funnel = {
      awareness: { count: 0, conversion: 0 },
      consideration: { count: 0, conversion: 0 },
      conversion: { count: 0, conversion: 0 },
      retention: { count: 0, conversion: 0 }
    };
    
    activities.forEach(activity => {
      switch (activity._id) {
        case 'page_view':
          funnel.awareness.count = activity.count;
          break;
        case 'product_view':
          funnel.consideration.count = activity.count;
          break;
        case 'add_to_cart':
          funnel.conversion.count = activity.count;
          break;
        case 'payment_success':
          funnel.retention.count = activity.count;
          break;
      }
    });
    
    // Calculate conversion rates
    if (funnel.awareness.count > 0) {
      funnel.awareness.conversion = (funnel.consideration.count / funnel.awareness.count) * 100;
    }
    if (funnel.consideration.count > 0) {
      funnel.consideration.conversion = (funnel.conversion.count / funnel.consideration.count) * 100;
    }
    if (funnel.conversion.count > 0) {
      funnel.conversion.conversion = (funnel.retention.count / funnel.conversion.count) * 100;
    }
    
    res.json({
      success: true,
      data: {
        funnel,
        activities
      }
    });
  } catch (error) {
    console.error('Error getting conversion analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get conversion analytics'
    });
  }
};

// Get fraud analytics
exports.getFraudAnalytics = async (req, res) => {
  try {
    const { period = '7d' } = req.query;
    const days = parseInt(period.replace('d', '')) || 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    
    // Get suspicious activities
    const suspiciousActivities = await ActivityLog.find({
      isSuspicious: true,
      timestamp: { $gte: startDate }
    })
    .sort({ timestamp: -1 })
    .limit(100);
    
    // Get failed payments
    const failedPayments = await Transaction.find({
      status: 'failed',
      createdAt: { $gte: startDate }
    })
    .populate('store', 'storeName')
    .sort({ createdAt: -1 })
    .limit(50);
    
    // Get multiple account attempts (same IP, different emails)
    const ipActivities = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          action: 'user_login',
          ipAddress: { $ne: null }
        }
      },
      {
        $group: {
          _id: '$ipAddress',
          uniqueUsers: { $addToSet: '$userId' },
          totalLogins: { $sum: 1 },
          lastActivity: { $max: '$timestamp' }
        }
      },
      {
        $match: {
          $expr: { $gt: [{ $size: '$uniqueUsers' }, 3] } // More than 3 users from same IP
        }
      },
      { $sort: { totalLogins: -1 } },
      { $limit: 20 }
    ]);
    
    // Calculate fraud metrics
    const totalSuspicious = suspiciousActivities.length;
    const totalFailedPayments = failedPayments.length;
    const totalSuspiciousIPs = ipActivities.length;
    
    res.json({
      success: true,
      data: {
        metrics: {
          totalSuspicious,
          totalFailedPayments,
          totalSuspiciousIPs,
          fraudRiskScore: Math.min(100, (totalSuspicious * 2 + totalFailedPayments * 3 + totalSuspiciousIPs * 5))
        },
        suspiciousActivities: suspiciousActivities.slice(0, 10),
        failedPayments: failedPayments.slice(0, 10),
        suspiciousIPs: ipActivities,
        recommendations: generateFraudRecommendations(totalSuspicious, totalFailedPayments, totalSuspiciousIPs)
      }
    });
  } catch (error) {
    console.error('Error getting fraud analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get fraud analytics'
    });
  }
};

// Get real-time analytics
exports.getRealtimeAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    
    const [
      currentUsers,
      recentOrders,
      recentPayments,
      systemHealth,
      activeStores
    ] = await Promise.all([
      // Current active users (logged in within last hour)
      User.countDocuments({ lastLogin: { $gte: oneHourAgo } }),
      
      // Recent orders (last 5 minutes)
      Order.countDocuments({ createdAt: { $gte: fiveMinutesAgo } }),
      
      // Recent payments (last 5 minutes)
      Transaction.countDocuments({ 
        status: 'completed',
        createdAt: { $gte: fiveMinutesAgo }
      }),
      
      // System health
      this.getSystemHealthData(),
      
      // Active stores (with recent activity)
      Store.countDocuments({ 
        $or: [
          { updatedAt: { $gte: oneHourAgo } },
          { 'analytics.lastActivity': { $gte: oneHourAgo } }
        ]
      })
    ]);
    
    res.json({
      success: true,
      data: {
        timestamp: now.toISOString(),
        currentUsers,
        recentOrders,
        recentPayments,
        activeStores,
        systemHealth,
        alerts: await getRecentAlerts()
      }
    });
  } catch (error) {
    console.error('Error getting real-time analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get real-time analytics'
    });
  }
};

// Helper functions
async function getSystemHealthData() {
  return {
    database: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
    api: 'healthy',
    memory: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
    uptime: `${Math.floor(process.uptime() / 60)} minutes`,
    responseTime: 'fast'
  };
}

async function getRecentAlerts() {
  // Get recent suspicious activities
  const suspicious = await ActivityLog.countDocuments({
    isSuspicious: true,
    timestamp: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // Last 30 minutes
  });
  
  // Get recent failed payments
  const failedPayments = await Transaction.countDocuments({
    status: 'failed',
    createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
  });
  
  const alerts = [];
  
  if (suspicious > 5) {
    alerts.push({
      level: 'warning',
      message: `${suspicious} suspicious activities detected in last 30 minutes`,
      type: 'security'
    });
  }
  
  if (failedPayments > 10) {
    alerts.push({
      level: 'warning',
      message: `${failedPayments} failed payments in last 30 minutes`,
      type: 'payment'
    });
  }
  
  return alerts;
}

function generateFraudRecommendations(suspicious, failedPayments, suspiciousIPs) {
  const recommendations = [];
  
  if (suspicious > 20) {
    recommendations.push({
      priority: 'high',
      action: 'Review suspicious activity logs',
      reason: 'High number of suspicious activities detected'
    });
  }
  
  if (failedPayments > 15) {
    recommendations.push({
      priority: 'high',
      action: 'Check payment gateway configuration',
      reason: 'Unusually high failed payment rate'
    });
  }
  
  if (suspiciousIPs > 5) {
    recommendations.push({
      priority: 'medium',
      action: 'Consider IP-based rate limiting',
      reason: 'Multiple accounts detected from same IP addresses'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      priority: 'low',
      action: 'Continue regular monitoring',
      reason: 'No immediate fraud concerns detected'
    });
  }
  
  return recommendations;
}