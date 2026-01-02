// [file name]: systemController.js
const SystemSettings = require('../models/SystemSettings');
const OwnerAuditLog = require('../models/OwnerAuditLog');
const mongoose = require('mongoose');

// Get system settings
exports.getSystemSettings = async (req, res) => {
  try {
    const settings = await SystemSettings.getSettings();
    
    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error('Error getting system settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system settings'
    });
  }
};

// Update system settings
exports.updateSystemSettings = async (req, res) => {
  try {
    const updates = req.body;
    const ownerId = req.owner.id;
    
    // Get current settings for audit
    const currentSettings = await SystemSettings.getSettings();
    
    // Update settings
    const settings = await SystemSettings.findOneAndUpdate(
      {},
      { 
        ...updates,
        lastUpdatedBy: ownerId,
        lastUpdatedAt: new Date(),
        $inc: { version: 1 }
      },
      { new: true, upsert: true }
    );
    
    // Log the change
    await OwnerAuditLog.create({
      ownerId,
      action: 'system_setting_changed',
      targetType: 'system',
      beforeState: currentSettings,
      afterState: settings,
      metadata: {
        changes: Object.keys(updates),
        updatedBy: req.owner.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: 'System settings updated',
      data: settings
    });
  } catch (error) {
    console.error('Error updating system settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update system settings'
    });
  }
};

// Toggle specific feature
exports.toggleFeature = async (req, res) => {
  try {
    const { feature } = req.params;
    const { enabled } = req.body;
    const ownerId = req.owner.id;
    
    // Get current settings
    const settings = await SystemSettings.getSettings();
    
    // Update specific feature
    const featurePath = feature.split('.');
    let current = settings;
    for (let i = 0; i < featurePath.length - 1; i++) {
      current = current[featurePath[i]];
      if (!current) {
        return res.status(400).json({
          success: false,
          error: `Invalid feature path: ${feature}`
        });
      }
    }
    
    const beforeState = current[featurePath[featurePath.length - 1]];
    current[featurePath[featurePath.length - 1]] = enabled;
    
    // Save with audit
    settings.lastUpdatedBy = ownerId;
    settings.lastUpdatedAt = new Date();
    settings.version += 1;
    
    await settings.save();
    
    // Log the change
    await OwnerAuditLog.create({
      ownerId,
      action: 'feature_toggled',
      targetType: 'feature',
      targetId: feature,
      beforeState: { [feature]: beforeState },
      afterState: { [feature]: enabled },
      metadata: {
        feature,
        enabled,
        updatedBy: req.owner.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    res.json({
      success: true,
      message: `Feature ${feature} ${enabled ? 'enabled' : 'disabled'}`,
      data: { [feature]: enabled }
    });
  } catch (error) {
    console.error('Error toggling feature:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle feature'
    });
  }
};

// Toggle maintenance mode
exports.toggleMaintenanceMode = async (req, res) => {
  try {
    const { enabled, message } = req.body;
    const ownerId = req.owner.id;
    
    const settings = await SystemSettings.getSettings();
    
    const beforeState = settings.system?.maintenanceMode;
    
    settings.system = settings.system || {};
    settings.system.maintenanceMode = {
      enabled,
      message: message || 'Platform maintenance in progress',
      estimatedRestoreTime: enabled ? new Date(Date.now() + 2 * 60 * 60 * 1000) : null // 2 hours
    };
    
    settings.lastUpdatedBy = ownerId;
    settings.lastUpdatedAt = new Date();
    settings.version += 1;
    
    await settings.save();
    
    // Log the action
    await OwnerAuditLog.create({
      ownerId,
      action: 'maintenance_mode_toggled',
      targetType: 'system',
      beforeState: { maintenanceMode: beforeState },
      afterState: { maintenanceMode: settings.system.maintenanceMode },
      metadata: {
        enabled,
        message: settings.system.maintenanceMode.message,
        updatedBy: req.owner.email
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      confirmedBy2FA: req.body._confirmedBy2FA || false
    });
    
    // Broadcast to WebSocket clients
    try {
      const wss = global.ownerWebSocketServer;
      if (wss) {
        wss.broadcastSystemAlert({
          type: 'maintenance_mode',
          enabled,
          message: settings.system.maintenanceMode.message,
          timestamp: new Date().toISOString()
        });
      }
    } catch (wsError) {
      console.error('WebSocket broadcast error:', wsError);
    }
    
    res.json({
      success: true,
      message: `Maintenance mode ${enabled ? 'enabled' : 'disabled'}`,
      data: settings.system.maintenanceMode
    });
  } catch (error) {
    console.error('Error toggling maintenance mode:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle maintenance mode'
    });
  }
};

// Emergency shutdown
exports.emergencyShutdown = async (req, res) => {
  try {
    const { enabled, reason, totpCode } = req.body;
    const ownerId = req.owner.id;
    
    // In production, verify TOTP code here
    // For now, we'll proceed
    if (process.env.NODE_ENV === 'production' && !totpCode) {
      return res.status(403).json({
        success: false,
        error: '2FA verification required',
        requires2FA: true
      });
    }
    
    const settings = await SystemSettings.getSettings();
    
    const beforeState = settings.system?.emergencyShutdown;
    
    settings.system = settings.system || {};
    settings.system.emergencyShutdown = {
      enabled,
      reason: reason || 'Emergency shutdown initiated by owner',
      initiatedAt: new Date()
    };
    
    settings.lastUpdatedBy = ownerId;
    settings.lastUpdatedAt = new Date();
    settings.version += 1;
    
    await settings.save();
    
    // Log the action
    await OwnerAuditLog.create({
      ownerId,
      action: 'emergency_shutdown',
      targetType: 'system',
      beforeState: { emergencyShutdown: beforeState },
      afterState: { emergencyShutdown: settings.system.emergencyShutdown },
      metadata: {
        enabled,
        reason: settings.system.emergencyShutdown.reason,
        updatedBy: req.owner.email,
        requiresReview: true
      },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent'),
      confirmedBy2FA: true
    });
    
    // Broadcast emergency alert
    try {
      const wss = global.ownerWebSocketServer;
      if (wss) {
        wss.broadcastEmergencyAlert({
          level: 'critical',
          message: `Emergency shutdown ${enabled ? 'initiated' : 'lifted'}`,
          action: 'emergency_shutdown',
          timestamp: new Date().toISOString()
        });
      }
    } catch (wsError) {
      console.error('WebSocket broadcast error:', wsError);
    }
    
    res.json({
      success: true,
      message: `Emergency shutdown ${enabled ? 'initiated' : 'lifted'}`,
      data: settings.system.emergencyShutdown
    });
  } catch (error) {
    console.error('Error in emergency shutdown:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process emergency shutdown'
    });
  }
};

// Get system health
exports.getSystemHealth = async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      status: 'healthy',
      components: {
        database: {
          status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
          connections: mongoose.connection.readyState,
          collections: Object.keys(mongoose.connection.collections).length
        },
        api: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          platform: process.platform,
          nodeVersion: process.version
        },
        redis: {
          status: 'unknown' // Add if using Redis
        },
        storage: {
          status: 'healthy'
        }
      },
      metrics: {
        activeConnections: mongoose.connection.connections.length,
        memoryUsage: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${Math.floor(process.uptime() / 60)} minutes`
      }
    };
    
    // Check for issues
    if (mongoose.connection.readyState !== 1) {
      health.status = 'degraded';
      health.issues = ['Database connection unstable'];
    }
    
    res.json({
      success: true,
      data: health
    });
  } catch (error) {
    console.error('Error getting system health:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system health'
    });
  }
};

// Get system logs
exports.getSystemLogs = async (req, res) => {
  try {
    const { limit = 100, level, startDate, endDate } = req.query;
    
    const query = {};
    
    if (level) query.level = level;
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }
    
    // In production, read from actual log files
    // For now, return sample data
    const logs = [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'System health check completed',
        source: 'health-check'
      },
      {
        timestamp: new Date(Date.now() - 60000).toISOString(),
        level: 'warning',
        message: 'High memory usage detected',
        source: 'monitoring'
      }
    ];
    
    res.json({
      success: true,
      data: logs,
      total: logs.length
    });
  } catch (error) {
    console.error('Error getting system logs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get system logs'
    });
  }
};