// [file name]: masterOwnerController.js
const mongoose = require('mongoose');
const User = require('../models/User');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const Product = require('../models/Products');
const ActivityLog = require('../models/ActivityLog');
const SystemLog = require('../models/SystemLog');
const redis = require('../services/redis');

class MasterOwnerController {
  
  // MASTER CONTROL METHODS
  
  async masterControlPanel(req, res) {
    try {
      const command = req.body.command;
      const params = req.body.params || {};
      const ownerId = req.owner.id;
      
      // Log the command
      await SystemLog.create({
        type: 'owner_command',
        action: command,
        ownerId,
        params,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date()
      });
      
      switch (command) {
        // SYSTEM COMMANDS
        case 'emergency_shutdown':
          return await this.emergencyShutdown(params, ownerId);
          
        case 'toggle_maintenance':
          return await this.toggleMaintenanceMode(params.enable, params.message, ownerId);
          
        case 'purge_cache':
          return await this.purgeSystemCache(params.scope);
          
        case 'backup_database':
          return await this.backupDatabase(params.type);
          
        case 'health_check':
          return await this.systemHealthCheck();
          
        // USER COMMANDS
        case 'ban_user':
          return await this.banUser(params.userId, params.reason, ownerId);
          
        case 'impersonate_user':
          return await this.impersonateUser(params.userId, ownerId);
          
        case 'force_logout_user':
          return await this.forceLogoutUser(params.userId, ownerId);
          
        case 'reset_user_password':
          return await this.resetUserPassword(params.userId, ownerId);
          
        // STORE COMMANDS
        case 'suspend_store':
          return await this.suspendStore(params.storeId, params.reason, ownerId);
          
        case 'clear_store_cache':
          return await this.clearStoreCache(params.storeId);
          
        // FINANCIAL COMMANDS
        case 'refund_order':
          return await this.refundOrder(params.orderId, params.amount, params.reason, ownerId);
          
        case 'adjust_balance':
          return await this.adjustUserBalance(params.userId, params.amount, params.reason, ownerId);
          
        // BULK OPERATIONS
        case 'bulk_delete':
          return await this.bulkDelete(params.ids, params.type, ownerId);
          
        case 'bulk_export':
          return await this.bulkExport(params.ids, params.type, params.format);
          
        default:
          return res.status(400).json({
            success: false,
            error: 'Unknown command'
          });
      }
    } catch (error) {
      console.error('Master command error:', error);
      res.status(500).json({
        success: false,
        error: 'Command execution failed'
      });
    }
  }
  
  // EMERGENCY SHUTDOWN
  async emergencyShutdown(params, ownerId) {
    // This would trigger actual shutdown in production
    // For now, we'll just mark the system as in emergency mode
    
    await SystemLog.create({
      type: 'emergency_shutdown',
      action: 'shutdown_initiated',
      ownerId,
      params,
      severity: 'critical',
      timestamp: new Date()
    });
    
    // Broadcast to all WebSocket clients
    const wss = global.ownerWebSocketServer;
    if (wss) {
      wss.broadcastToOwners({
        type: 'emergency_alert',
        level: 'critical',
        message: 'Emergency shutdown initiated',
        action: 'shutdown',
        timestamp: new Date().toISOString()
      });
    }
    
    return {
      success: true,
      message: 'Emergency shutdown sequence initiated',
      requiresConfirmation: true
    };
  }
  
  // IMPERSONATE USER
  async impersonateUser(userId, ownerId) {
    const user = await User.findById(userId).select('+email +name +role');
    
    if (!user) {
      throw new Error('User not found');
    }
    
    if (user.role === 'owner') {
      throw new Error('Cannot impersonate another owner');
    }
    
    // Generate impersonation token
    const jwt = require('jsonwebtoken');
    const impersonationToken = jwt.sign(
      {
        userId: user._id,
        originalOwnerId: ownerId,
        isImpersonation: true,
        expiresIn: '1h'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Log the action
    await ActivityLog.create({
      type: 'owner_action',
      action: 'user_impersonated',
      ownerId,
      targetUserId: userId,
      metadata: {
        userEmail: user.email,
        userName: user.name,
        userRole: user.role
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    });
    
    return {
      success: true,
      token: impersonationToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    };
  }
  
  // FORCE LOGOUT USER
  async forceLogoutUser(userId, ownerId) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Invalidate all sessions
    user.refreshToken = null;
    user.lastLogout = new Date();
    await user.save();
    
    // Invalidate Redis sessions if using Redis
    await redis.del(`session:${userId}:*`);
    
    // Log the action
    await ActivityLog.create({
      type: 'owner_action',
      action: 'user_force_logout',
      ownerId,
      targetUserId: userId,
      metadata: {
        userEmail: user.email,
        userName: user.name
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    });
    
    // Broadcast logout to WebSocket
    const wss = global.ownerWebSocketServer;
    if (wss) {
      wss.broadcastForceLogout(userId);
    }
    
    return {
      success: true,
      message: `User ${user.email} logged out from all sessions`
    };
  }
  
  // BULK OPERATIONS
  async bulkDelete(ids, type, ownerId) {
    let Model;
    let collectionName;
    
    switch (type) {
      case 'users':
        Model = User;
        collectionName = 'users';
        break;
      case 'stores':
        Model = Store;
        collectionName = 'stores';
        break;
      case 'orders':
        Model = Order;
        collectionName = 'orders';
        break;
      case 'products':
        Model = Product;
        collectionName = 'products';
        break;
      default:
        throw new Error('Invalid type for bulk delete');
    }
    
    // Soft delete (add deletedAt timestamp)
    const result = await Model.updateMany(
      { _id: { $in: ids } },
      { $set: { deletedAt: new Date(), deletedBy: ownerId } }
    );
    
    // Log the bulk action
    await SystemLog.create({
      type: 'bulk_operation',
      action: `bulk_delete_${type}`,
      ownerId,
      metadata: {
        count: ids.length,
        ids: ids.slice(0, 10) // Log first 10 IDs only
      },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    });
    
    return {
      success: true,
      message: `Soft deleted ${result.modifiedCount} ${type}`,
      count: result.modifiedCount
    };
  }
  
  // SYSTEM HEALTH CHECK
  async systemHealthCheck() {
    const checks = [];
    
    // Database check
    try {
      const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
      checks.push({
        component: 'database',
        status: dbStatus,
        details: {
          connectionState: mongoose.connection.readyState,
          databaseName: mongoose.connection.name,
          modelsCount: Object.keys(mongoose.models).length
        }
      });
    } catch (error) {
      checks.push({
        component: 'database',
        status: 'error',
        error: error.message
      });
    }
    
    // Redis check
    try {
      await redis.ping();
      checks.push({
        component: 'redis',
        status: 'healthy',
        details: { connected: true }
      });
    } catch (error) {
      checks.push({
        component: 'redis',
        status: 'unhealthy',
        error: error.message
      });
    }
    
    // API check
    checks.push({
      component: 'api',
      status: 'healthy',
      details: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    });
    
    // Storage check
    try {
      const fs = require('fs');
      const path = require('path');
      const uploadsPath = path.join(__dirname, '../uploads');
      const stats = fs.statSync(uploadsPath);
      
      checks.push({
        component: 'storage',
        status: 'healthy',
        details: {
          uploadsPath: uploadsPath,
          exists: true,
          isDirectory: stats.isDirectory()
        }
      });
    } catch (error) {
      checks.push({
        component: 'storage',
        status: 'warning',
        error: 'Uploads directory not accessible'
      });
    }
    
    return {
      success: true,
      checks,
      overallStatus: checks.every(c => c.status === 'healthy') ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString()
    };
  }
  
  // GLOBAL SEARCH
  async globalSearch(req, res) {
    try {
      const { query, limit = 20 } = req.query;
      
      if (!query || query.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        });
      }
      
      const searchRegex = new RegExp(query, 'i');
      
      // Search across all collections in parallel
      const [users, stores, orders, products, transactions] = await Promise.all([
        // Users
        User.find({
          $or: [
            { name: searchRegex },
            { email: searchRegex },
            { phone: searchRegex }
          ]
        })
        .select('name email phone role isActive createdAt')
        .limit(limit)
        .lean(),
        
        // Stores
        Store.find({
          $or: [
            { storeName: searchRegex },
            { storeSlug: searchRegex },
            { contactEmail: searchRegex },
            { description: searchRegex }
          ]
        })
        .populate('owner', 'name email')
        .select('storeName storeSlug contactEmail isActive isBanned createdAt')
        .limit(limit)
        .lean(),
        
        // Orders
        Order.find({
          $or: [
            { orderId: searchRegex },
            { 'customer.email': searchRegex },
            { 'customer.name': searchRegex },
            { 'customer.phone': searchRegex }
          ]
        })
        .select('orderId total customer status createdAt')
        .populate('store', 'storeName')
        .limit(limit)
        .lean(),
        
        // Products
        Product.find({
          $or: [
            { name: searchRegex },
            { sku: searchRegex },
            { description: searchRegex }
          ]
        })
        .select('name sku price stock status createdAt')
        .populate('store', 'storeName')
        .limit(limit)
        .lean(),
        
        // Transactions
        Transaction.find({
          $or: [
            { transactionId: searchRegex },
            { orderId: searchRegex },
            { 'customer.email': searchRegex }
          ]
        })
        .select('transactionId orderId amount status gateway createdAt')
        .populate('store', 'storeName')
        .limit(limit)
        .lean()
      ]);
      
      res.json({
        success: true,
        data: {
          users,
          stores,
          orders,
          products,
          transactions
        },
        counts: {
          users: users.length,
          stores: stores.length,
          orders: orders.length,
          products: products.length,
          transactions: transactions.length
        },
        query,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Global search error:', error);
      res.status(500).json({
        success: false,
        error: 'Search failed'
      });
    }
  }
  
  // REAL-TIME DASHBOARD DATA
  async realtimeDashboard(req, res) {
    try {
      const now = new Date();
      const today = new Date(now.setHours(0, 0, 0, 0));
      const hourAgo = new Date(Date.now() - 3600000);
      
      const [
        liveStats,
        recentActivities,
        systemAlerts,
        topPerformers,
        revenueChart,
        userGrowthChart
      ] = await Promise.all([
        // Live stats
        this.getLiveStats(),
        
        // Recent activities (last 10 minutes)
        ActivityLog.find({
          timestamp: { $gte: new Date(Date.now() - 600000) }
        })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean(),
        
        // System alerts (last 24 hours)
        SystemLog.find({
          severity: { $in: ['high', 'critical'] },
          timestamp: { $gte: new Date(Date.now() - 86400000) }
        })
        .sort({ timestamp: -1 })
        .limit(20)
        .lean(),
        
        // Top performing stores (today)
        Transaction.aggregate([
          {
            $match: {
              status: 'completed',
              createdAt: { $gte: today }
            }
          },
          {
            $group: {
              _id: '$store',
              revenue: { $sum: '$amount' },
              orders: { $sum: 1 }
            }
          },
          { $sort: { revenue: -1 } },
          { $limit: 5 },
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
        
        // Revenue chart data (last 7 days)
        Transaction.aggregate([
          {
            $match: {
              status: 'completed',
              createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }
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
          { $sort: { _id: 1 } }
        ]),
        
        // User growth (last 7 days)
        User.aggregate([
          {
            $match: {
              createdAt: { $gte: new Date(Date.now() - 7 * 86400000) }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              users: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ])
      ]);
      
      res.json({
        success: true,
        data: {
          liveStats,
          recentActivities,
          systemAlerts,
          topPerformers,
          charts: {
            revenue: revenueChart,
            userGrowth: userGrowthChart
          }
        },
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Realtime dashboard error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to load dashboard data'
      });
    }
  }
  
  async getLiveStats() {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60000);
    const hourAgo = new Date(now.getTime() - 3600000);
    
    const [
      onlineUsers,
      activeSessions,
      pendingOrders,
      failedPayments,
      newUsers,
      newOrders
    ] = await Promise.all([
      // Users active in last 5 minutes
      User.countDocuments({ lastLogin: { $gte: fiveMinutesAgo } }),
      
      // Active sessions (from Redis or database)
      this.getActiveSessionCount(),
      
      // Pending orders
      Order.countDocuments({ status: 'pending' }),
      
      // Failed payments in last hour
      Transaction.countDocuments({
        status: 'failed',
        createdAt: { $gte: hourAgo }
      }),
      
      // New users in last hour
      User.countDocuments({ createdAt: { $gte: hourAgo } }),
      
      // New orders in last hour
      Order.countDocuments({ createdAt: { $gte: hourAgo } })
    ]);
    
    return {
      onlineUsers,
      activeSessions,
      pendingOrders,
      failedPayments,
      newUsers,
      newOrders,
      timestamp: new Date().toISOString()
    };
  }
  
  async getActiveSessionCount() {
    try {
      // If using Redis for sessions
      const keys = await redis.keys('session:*');
      return keys.length;
    } catch (error) {
      // Fallback to database check
      return await User.countDocuments({
        lastLogin: { $gte: new Date(Date.now() - 300000) }
      });
    }
  }
}

module.exports = new MasterOwnerController();