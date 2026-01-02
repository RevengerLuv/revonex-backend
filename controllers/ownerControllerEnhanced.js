// [file name]: ownerControllerEnhanced.js
const User = require('../models/User');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const ActivityLog = require('../models/ActivityLog');
const OwnerAuditLog = require('../models/OwnerAuditLog');
const mongoose = require('mongoose');

// Global search across all entities
exports.globalSearch = async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;
    
    if (!query || query.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Search query must be at least 2 characters'
      });
    }
    
    const searchRegex = new RegExp(query, 'i');
    
    // Parallel searches
    const [users, stores, orders, payments] = await Promise.all([
      // Users
      User.find({
        $or: [
          { name: searchRegex },
          { email: searchRegex }
        ]
      })
      .select('name email role isActive isBanned createdAt')
      .limit(limit)
      .lean(),
      
      // Stores
      Store.find({
        $or: [
          { storeName: searchRegex },
          { storeSlug: searchRegex },
          { contactEmail: searchRegex }
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
          { 'customer.name': searchRegex }
        ]
      })
      .select('orderId total customer status createdAt')
      .populate('store', 'storeName')
      .limit(limit)
      .lean(),
      
      // Payments
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
        users: users.map(u => ({ type: 'user', ...u })),
        stores: stores.map(s => ({ type: 'store', ...s })),
        orders: orders.map(o => ({ type: 'order', ...o })),
        payments: payments.map(p => ({ type: 'payment', ...p }))
      },
      counts: {
        users: users.length,
        stores: stores.length,
        orders: orders.length,
        payments: payments.length
      }
    });
    
  } catch (error) {
    console.error('Global search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// Force logout user from all sessions
exports.forceLogoutUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Invalidate all sessions (implementation depends on session store)
    // For JWT, you'd need a token blacklist or store active sessions
    user.refreshToken = null;
    await user.save();
    
    // Log the action
    await OwnerAuditLog.create({
      ownerId: req.owner.id,
      action: 'user_force_logout',
      targetType: 'user',
      targetId: userId,
      metadata: {
        userEmail: user.email,
        userName: user.name,
        forcedBy: req.owner.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    // Broadcast via WebSocket
    try {
      const OwnerWebSocketServer = require('../services/ownerWebSocketServer');
      const wss = global.ownerWebSocketServer;
      if (wss) {
        wss.broadcastForceLogout(userId);
      }
    } catch (wsError) {
      console.error('WebSocket broadcast error:', wsError);
    }
    
    res.json({
      success: true,
      message: `User ${user.email} logged out from all sessions`
    });
    
  } catch (error) {
    console.error('Force logout error:', error);
    res.status(500).json({ success: false, error: 'Failed to force logout' });
  }
};

// Impersonate user
exports.impersonateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await User.findById(userId).select('+email +name +role');
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }
    
    // Check if user can be impersonated
    if (user.role === 'owner') {
      return res.status(403).json({ 
        success: false, 
        error: 'Cannot impersonate another owner' 
      });
    }
    
    // Generate impersonation token
    const jwt = require('jsonwebtoken');
    const impersonationToken = jwt.sign(
      {
        userId: user._id,
        originalOwnerId: req.owner.id,
        isImpersonation: true,
        expiresIn: '1h'
      },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );
    
    // Log the impersonation
    await OwnerAuditLog.create({
      ownerId: req.owner.id,
      action: 'user_impersonated',
      targetType: 'user',
      targetId: userId,
      metadata: {
        userEmail: user.email,
        userName: user.name,
        userRole: user.role,
        impersonatedBy: req.owner.email,
        expiresAt: new Date(Date.now() + 3600000)
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      requiresReview: true
    });
    
    res.json({
      success: true,
      message: `Impersonating ${user.email}`,
      data: {
        token: impersonationToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          isImpersonation: true
        },
        originalOwner: {
          id: req.owner.id,
          email: req.owner.email
        }
      }
    });
    
  } catch (error) {
    console.error('Impersonation error:', error);
    res.status(500).json({ success: false, error: 'Impersonation failed' });
  }
};

// Override order status
exports.overrideOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, reason, notifyCustomer } = req.body;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    const beforeState = {
      status: order.status,
      paymentStatus: order.paymentStatus,
      updatedAt: order.updatedAt
    };
    
    // Update order
    order.status = status;
    order.notes = order.notes ? `${order.notes}\n[Owner Override] ${reason}` : `[Owner Override] ${reason}`;
    
    // Handle inventory if cancelling
    if (status === 'cancelled' && order.status !== 'cancelled') {
      // Release inventory if any was reserved
      if (order.inventoryReserved) {
        // Implementation depends on inventory system
        console.log(`Releasing inventory for cancelled order ${orderId}`);
      }
    }
    
    await order.save();
    
    // Log the action
    await OwnerAuditLog.create({
      ownerId: req.owner.id,
      action: 'order_overridden',
      targetType: 'order',
      targetId: order._id,
      beforeState,
      afterState: {
        status: order.status,
        paymentStatus: order.paymentStatus,
        updatedAt: order.updatedAt
      },
      metadata: {
        orderId: order.orderId,
        reason,
        notifyCustomer,
        customerEmail: order.customer?.email,
        amount: order.total
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      confirmedBy2FA: req.body._confirmedBy2FA || false
    });
    
    // Notify via WebSocket
    try {
      const wss = global.ownerWebSocketServer;
      if (wss) {
        wss.broadcastOrderUpdate(order);
      }
    } catch (wsError) {
      console.error('WebSocket broadcast error:', wsError);
    }
    
    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      data: order
    });
    
  } catch (error) {
    console.error('Order override error:', error);
    res.status(500).json({ success: false, error: 'Failed to update order status' });
  }
};

// Force refund
exports.forceRefund = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason, notifyCustomer } = req.body;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }
    
    // Find payment transaction
    const transaction = await Transaction.findOne({ orderId });
    
    const beforeState = {
      paymentStatus: order.paymentStatus,
      refunds: order.refunds || []
    };
    
    // Update order
    order.paymentStatus = 'refunded';
    order.refunds = order.refunds || [];
    order.refunds.push({
      refundId: `REF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      amount: amount || order.total,
      reason: reason || 'Owner forced refund',
      status: 'processed',
      processedAt: new Date(),
      processedBy: req.owner.email
    });
    
    await order.save();
    
    // Update transaction if exists
    if (transaction) {
      transaction.status = 'refunded';
      transaction.refunds = transaction.refunds || [];
      transaction.refunds.push({
        refundId: order.refunds[order.refunds.length - 1].refundId,
        amount: amount || order.total,
        reason: reason || 'Owner forced refund',
        status: 'processed',
        processedAt: new Date()
      });
      await transaction.save();
    }
    
    // Log the action
    await OwnerAuditLog.create({
      ownerId: req.owner.id,
      action: 'refund_forced',
      targetType: 'order',
      targetId: order._id,
      beforeState,
      afterState: {
        paymentStatus: order.paymentStatus,
        refunds: order.refunds
      },
      metadata: {
        orderId: order.orderId,
        amount: amount || order.total,
        reason,
        notifyCustomer,
        customerEmail: order.customer?.email,
        transactionId: transaction?.transactionId
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      confirmedBy2FA: req.body._confirmedBy2FA || false,
      requiresReview: true
    });
    
    res.json({
      success: true,
      message: `Refund of ${amount || order.total} processed for order ${orderId}`,
      data: {
        order: {
          id: order.orderId,
          paymentStatus: order.paymentStatus,
          refunds: order.refunds
        },
        transaction: transaction ? {
          id: transaction.transactionId,
          status: transaction.status
        } : null
      }
    });
    
  } catch (error) {
    console.error('Force refund error:', error);
    res.status(500).json({ success: false, error: 'Failed to process refund' });
  }
};

// Enhanced user search with advanced filters
exports.searchUsers = async (req, res) => {
  try {
    const {
      query,
      role,
      status,
      hasStores,
      lastLoginDays,
      registrationDateFrom,
      registrationDateTo,
      orderBy = 'createdAt',
      order = 'desc',
      page = 1,
      limit = 20
    } = req.query;
    
    const filter = {};
    
    // Text search
    if (query) {
      filter.$or = [
        { name: new RegExp(query, 'i') },
        { email: new RegExp(query, 'i') }
      ];
    }
    
    // Role filter
    if (role && role !== 'all') filter.role = role;
    
    // Status filters
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'banned') filter.isBanned = true;
    if (status === 'verified') filter.emailVerified = true;
    if (status === 'unverified') filter.emailVerified = false;
    
    // Has stores filter
    if (hasStores === 'true') {
      filter.stores = { $exists: true, $not: { $size: 0 } };
    } else if (hasStores === 'false') {
      filter.$or = [
        { stores: { $exists: false } },
        { stores: { $size: 0 } }
      ];
    }
    
    // Last login filter
    if (lastLoginDays) {
      const daysAgo = new Date(Date.now() - lastLoginDays * 24 * 60 * 60 * 1000);
      filter.lastLogin = { $gte: daysAgo };
    }
    
    // Registration date range
    if (registrationDateFrom || registrationDateTo) {
      filter.createdAt = {};
      if (registrationDateFrom) filter.createdAt.$gte = new Date(registrationDateFrom);
      if (registrationDateTo) filter.createdAt.$lte = new Date(registrationDateTo);
    }
    
    const sort = {};
    sort[orderBy] = order === 'desc' ? -1 : 1;
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get users with enhanced stats
    const users = await User.find(filter)
      .select('-password -emailVerificationToken -passwordResetToken')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await User.countDocuments(filter);
    
    // Get enhanced stats for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        const [stores, orders, totalSpent, lastOrder, loginHistory] = await Promise.all([
          // User's stores
          Store.find({ owner: user._id })
            .select('storeName storeSlug isActive revenue totalSales')
            .lean(),
          
          // User's orders
          Order.find({ userId: user._id })
            .select('orderId total status createdAt')
            .sort({ createdAt: -1 })
            .limit(10)
            .lean(),
          
          // Total spent
          Order.aggregate([
            { $match: { userId: user._id, status: 'completed', paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: '$total' } } }
          ]),
          
          // Last order
          Order.findOne({ userId: user._id })
            .sort({ createdAt: -1 })
            .select('orderId total createdAt')
            .lean(),
          
          // Recent login history
          ActivityLog.find({ 
            userId: user._id, 
            action: 'user_login' 
          })
          .sort({ timestamp: -1 })
          .limit(5)
          .select('timestamp ipAddress deviceInfo')
          .lean()
        ]);
        
        // Calculate metrics
        const totalOrders = await Order.countDocuments({ userId: user._id });
        const completedOrders = await Order.countDocuments({ 
          userId: user._id, 
          status: 'completed',
          paymentStatus: 'paid' 
        });
        
        return {
          ...user.toObject(),
          stats: {
            totalStores: stores.length,
            totalOrders,
            completedOrders,
            totalSpent: totalSpent[0]?.total || 0,
            avgOrderValue: completedOrders > 0 ? (totalSpent[0]?.total || 0) / completedOrders : 0,
            conversionRate: 0, // Would need visitor data
            lastOrder: lastOrder ? {
              id: lastOrder.orderId,
              amount: lastOrder.total,
              date: lastOrder.createdAt
            } : null,
            loginHistory: loginHistory.map(l => ({
              date: l.timestamp,
              ip: l.ipAddress,
              device: l.deviceInfo
            }))
          },
          stores: stores
        };
      })
    );
    
    // Calculate platform-wide metrics for comparison
    const platformAvgOrderValue = await getPlatformAverageOrderValue();
    const platformAvgStoresPerUser = await getAverageStoresPerUser();
    
    res.json({
      success: true,
      data: {
        users: usersWithStats,
        metrics: {
          platformAvgOrderValue,
          platformAvgStoresPerUser
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
    console.error('User search error:', error);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// Helper functions
async function getPlatformAverageOrderValue() {
  const result = await Order.aggregate([
    { $match: { status: 'completed', paymentStatus: 'paid' } },
    { $group: { _id: null, avg: { $avg: '$total' }, count: { $sum: 1 } } }
  ]);
  return result[0]?.avg || 0;
}

async function getAverageStoresPerUser() {
  const [storeOwners, totalStores] = await Promise.all([
    User.countDocuments({ role: 'store_owner' }),
    Store.countDocuments()
  ]);
  
  return storeOwners > 0 ? totalStores / storeOwners : 0;
}

// Export the enhanced controller functions
module.exports = exports;