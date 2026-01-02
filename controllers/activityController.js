// [file name]: activityController.js
const ActivityLog = require('../models/ActivityLog');
const OwnerAuditLog = require('../models/OwnerAuditLog');

// Get activities with filters
exports.getActivities = async (req, res) => {
  try {
    const {
      userId,
      userRole,
      action,
      entityType,
      storeId,
      startDate,
      endDate,
      isSuspicious,
      search,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    // Apply filters
    if (userId) query.userId = userId;
    if (userRole) query.userRole = userRole;
    if (action) query.action = action;
    if (entityType) query.entityType = entityType;
    if (storeId) query.storeId = storeId;
    if (isSuspicious !== undefined) query.isSuspicious = isSuspicious === 'true';
    
    // Date range
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Search
    if (search) {
      query.$or = [
        { userEmail: new RegExp(search, 'i') },
        { action: new RegExp(search, 'i') },
        { 'metadata.endpoint': new RegExp(search, 'i') }
      ];
    }
    
    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Execute query
    const [activities, total, suspiciousCount] = await Promise.all([
      ActivityLog.find(query)
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      ActivityLog.countDocuments(query),
      
      ActivityLog.countDocuments({ ...query, isSuspicious: true })
    ]);
    
    // Calculate risk distribution
    const riskDistribution = await ActivityLog.aggregate([
      { $match: query },
      {
        $bucket: {
          groupBy: '$riskScore',
          boundaries: [0, 20, 40, 60, 80, 101],
          default: 'other',
          output: {
            count: { $sum: 1 },
            avgRisk: { $avg: '$riskScore' }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: activities,
      total,
      suspiciousCount,
      riskDistribution,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get activities'
    });
  }
};

// Get live activities (last 5 minutes)
exports.getLiveActivities = async (req, res) => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const activities = await ActivityLog.find({
      timestamp: { $gte: fiveMinutesAgo }
    })
    .sort({ timestamp: -1 })
    .limit(100)
    .lean();
    
    // Group by action type for summary
    const summary = await ActivityLog.aggregate([
      { $match: { timestamp: { $gte: fiveMinutesAgo } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          avgRisk: { $avg: '$riskScore' },
          suspicious: { $sum: { $cond: [{ $eq: ['$isSuspicious', true] }, 1, 0] } }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: activities,
      summary,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting live activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get live activities'
    });
  }
};

// Get suspicious activities
exports.getSuspiciousActivities = async (req, res) => {
  try {
    const { period = '24h', riskThreshold = 70 } = req.query;
    const hours = parseInt(period.replace('h', '')) || 24;
    const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    
    const activities = await ActivityLog.find({
      timestamp: { $gte: startDate },
      $or: [
        { isSuspicious: true },
        { riskScore: { $gte: riskThreshold } }
      ]
    })
    .sort({ riskScore: -1, timestamp: -1 })
    .limit(200)
    .populate('userId', 'name email')
    .populate('storeId', 'storeName')
    .lean();
    
    // Calculate statistics
    const stats = await ActivityLog.aggregate([
      {
        $match: {
          timestamp: { $gte: startDate },
          $or: [
            { isSuspicious: true },
            { riskScore: { $gte: riskThreshold } }
          ]
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          avgRisk: { $avg: '$riskScore' },
          maxRisk: { $max: '$riskScore' },
          byAction: {
            $push: {
              action: '$action',
              riskScore: '$riskScore'
            }
          }
        }
      }
    ]);
    
    res.json({
      success: true,
      data: activities,
      stats: stats[0] || { total: 0, avgRisk: 0, maxRisk: 0, byAction: [] },
      period: hours
    });
  } catch (error) {
    console.error('Error getting suspicious activities:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get suspicious activities'
    });
  }
};

// Get audit logs
exports.getAuditLogs = async (req, res) => {
  try {
    const {
      ownerId,
      action,
      targetType,
      targetId,
      startDate,
      endDate,
      requiresReview,
      page = 1,
      limit = 50,
      sortBy = 'timestamp',
      sortOrder = 'desc'
    } = req.query;
    
    const query = {};
    
    if (ownerId) query.ownerId = ownerId;
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (targetId) query.targetId = targetId;
    if (requiresReview !== undefined) query.requiresReview = requiresReview === 'true';
    
    // Date range
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // Sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get audit logs with owner details
    const [logs, total, pendingReview] = await Promise.all([
      OwnerAuditLog.find(query)
        .populate('ownerId', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      
      OwnerAuditLog.countDocuments(query),
      
      OwnerAuditLog.countDocuments({ ...query, requiresReview: true })
    ]);
    
    // Get action statistics
    const actionStats = await OwnerAuditLog.aggregate([
      { $match: query },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          avgResponseTime: { $avg: { $subtract: ['$updatedAt', '$createdAt'] } }
        }
      },
      { $sort: { count: -1 } }
    ]);
    
    res.json({
      success: true,
      data: logs,
      total,
      pendingReview,
      actionStats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit logs'
    });
  }
};

// Get audit log details
exports.getAuditLogDetails = async (req, res) => {
  try {
    const { logId } = req.params;
    
    const log = await OwnerAuditLog.findById(logId)
      .populate('ownerId', 'name email')
      .populate('targetId')
      .lean();
    
    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found'
      });
    }
    
    // Get related activities around the same time
    const relatedActivities = await ActivityLog.find({
      timestamp: {
        $gte: new Date(log.timestamp.getTime() - 5 * 60 * 1000), // 5 minutes before
        $lte: new Date(log.timestamp.getTime() + 5 * 60 * 1000)  // 5 minutes after
      },
      $or: [
        { userId: log.ownerId },
        { ipAddress: log.ipAddress }
      ]
    })
    .sort({ timestamp: -1 })
    .limit(10)
    .lean();
    
    res.json({
      success: true,
      data: {
        log,
        relatedActivities,
        context: {
          timeWindow: '10 minutes',
          relatedCount: relatedActivities.length
        }
      }
    });
  } catch (error) {
    console.error('Error getting audit log details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get audit log details'
    });
  }
};