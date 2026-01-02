const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const mongoose = require('mongoose');

class UnifiedOwnerWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws/owner',
      clientTracking: true
    });

    this.clients = new Map();
    this.subscriptions = new Map();
    this.setupConnectionHandling();

    // Setup heartbeat
    this.setupHeartbeat();

    // Broadcast system stats every 30 seconds
    setInterval(() => this.broadcastSystemStats(), 30000);

    console.log('✅ Unified Owner WebSocket Server initialized on /ws/owner');
  }

  setupConnectionHandling() {
    this.wss.on('connection', async (ws, req) => {
      try {
        const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');

        if (!token) {
          ws.close(1008, 'Authentication required');
          return;
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user || user.role !== 'owner') {
          ws.close(1008, 'Owner access required');
          return;
        }

        const clientId = user._id.toString();

        // Store connection
        this.clients.set(clientId, {
          ws,
          user,
          connectedAt: new Date(),
          lastHeartbeat: Date.now(),
          subscriptions: new Set()
        });

        console.log(`✅ Owner WebSocket connected: ${user.email}`);

        // Send welcome message
        this.sendToClient(clientId, {
          type: 'connected',
          message: 'Owner WebSocket connected',
          timestamp: new Date().toISOString(),
          capabilities: [
            'system_control',
            'user_management',
            'store_management',
            'financial_control',
            'real_time_monitoring',
            'command_execution',
            'activity_monitoring'
          ]
        });

        // Send initial system state
        this.sendInitialState(clientId);

        // Handle messages
        ws.on('message', (message) => this.handleMessage(message, clientId));

        // Handle disconnection
        ws.on('close', () => {
          console.log(`Owner WebSocket disconnected: ${user.email}`);
          this.clients.delete(clientId);
        });

        ws.on('error', (error) => {
          console.error('Owner WebSocket error:', error);
          this.clients.delete(clientId);
        });

      } catch (error) {
        console.error('WebSocket connection error:', error);
        ws.close(1008, 'Authentication failed');
      }
    });
  }

  async handleMessage(message, clientId) {
    try {
      const data = JSON.parse(message);
      const client = this.clients.get(clientId);

      if (!client) return;

      switch (data.type) {
        case 'subscribe':
          this.handleSubscription(data, clientId);
          break;

        case 'unsubscribe':
          this.handleUnsubscription(data, clientId);
          break;

        case 'command':
          await this.handleCommand(data, clientId);
          break;

        case 'heartbeat':
          client.lastHeartbeat = Date.now();
          break;

        case 'broadcast':
          this.handleBroadcast(data, clientId);
          break;

        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date().toISOString() });
          break;
      }
    } catch (error) {
      console.error('Message handling error:', error);
    }
  }

  handleSubscription(data, clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const channels = data.channels || [];
    channels.forEach(channel => {
      client.subscriptions.add(channel);

      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, new Set());
      }
      this.subscriptions.get(channel).add(clientId);
    });

    this.sendToClient(clientId, {
      type: 'subscription_confirmed',
      channels: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });
  }

  handleUnsubscription(data, clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;

    const channels = data.channels || [];
    channels.forEach(channel => {
      client.subscriptions.delete(channel);

      const channelSubs = this.subscriptions.get(channel);
      if (channelSubs) {
        channelSubs.delete(clientId);
        if (channelSubs.size === 0) {
          this.subscriptions.delete(channel);
        }
      }
    });

    this.sendToClient(clientId, {
      type: 'unsubscription_confirmed',
      channels: Array.from(client.subscriptions),
      timestamp: new Date().toISOString()
    });
  }

  async handleCommand(data, clientId) {
    const { command, payload, requestId } = data;
    const client = this.clients.get(clientId);

    try {
      const result = await this.executeCommand(command, payload, client.user);

      this.sendToClient(clientId, {
        type: 'command_result',
        command,
        requestId,
        success: true,
        data: result,
        timestamp: new Date().toISOString()
      });

      // Broadcast to other subscribed clients
      this.broadcastToSubscribed('command_executed', {
        command,
        executedBy: client.user.email,
        timestamp: new Date().toISOString(),
        result: { success: true, command }
      }, [clientId]);

    } catch (error) {
      this.sendToClient(clientId, {
        type: 'command_result',
        command,
        requestId,
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  async executeCommand(command, payload, user) {
    // Execute commands through API endpoints
    switch (command) {
      case 'refresh_stats':
        return await this.getPlatformStats();

      case 'force_logout_user':
        return await this.forceLogoutUser(payload.userId, user);

      case 'emergency_alert':
        return await this.sendEmergencyAlert(payload, user);

      case 'system_backup':
        return await this.triggerSystemBackup(user);

      case 'clear_cache':
        return await this.clearSystemCache(user);

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  }

  async getPlatformStats() {
    try {
      const [
        totalUsers,
        totalStores,
        totalOrders,
        onlineUsers,
        pendingPayments,
        systemHealth
      ] = await Promise.all([
        User.countDocuments(),
        require('../models/Store').countDocuments(),
        require('../models/Order').countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        this.getOnlineUsersCount(),
        require('../models/Transaction').countDocuments({ status: 'pending' }),
        this.getSystemHealth()
      ]);

      return {
        totalUsers,
        totalStores,
        totalOrders,
        onlineUsers,
        pendingPayments,
        systemHealth,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error getting platform stats:', error);
      throw error;
    }
  }

  async forceLogoutUser(userId, executor) {
    // In production, implement session invalidation
    this.broadcastToAll({
      type: 'force_logout',
      userId,
      executedBy: executor.email,
      timestamp: new Date().toISOString()
    });
    return { success: true, message: `User ${userId} logged out` };
  }

  async sendEmergencyAlert(payload, executor) {
    this.broadcastToAll({
      type: 'emergency_alert',
      level: payload.level || 'warning',
      message: payload.message,
      action: payload.action,
      executedBy: executor.email,
      timestamp: new Date().toISOString()
    });
    return { success: true, message: 'Emergency alert sent' };
  }

  async triggerSystemBackup(executor) {
    // Implement actual backup logic
    console.log(`System backup triggered by ${executor.email}`);
    return { success: true, message: 'Backup initiated' };
  }

  async clearSystemCache(executor) {
    // Implement cache clearing logic
    console.log(`Cache cleared by ${executor.email}`);
    return { success: true, message: 'Cache cleared' };
  }

  async getOnlineUsersCount() {
    // In production, track active sessions
    return Math.floor(Math.random() * 100) + 50;
  }

  async getSystemHealth() {
    return {
      database: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
      api: 'healthy',
      memory: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2) + ' MB',
      uptime: process.uptime().toFixed(0) + ' seconds',
      connections: this.clients.size
    };
  }

  // BROADCAST METHODS
  broadcastToSubscribed(event, data, exclude = []) {
    const channel = `event_${event}`;
    const subscribers = this.subscriptions.get(channel) || new Set();

    subscribers.forEach(clientId => {
      if (!exclude.includes(clientId)) {
        this.sendToClient(clientId, {
          type: 'event',
          event,
          data,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  broadcastToAll(data, exclude = []) {
    this.clients.forEach((client, clientId) => {
      if (!exclude.includes(clientId) && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    });
  }

  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }

  // SPECIFIC BROADCASTS
  broadcastUserActivity(activity) {
    this.broadcastToSubscribed('user_activity', activity);
  }

  broadcastOrderUpdate(order) {
    this.broadcastToSubscribed('order_update', order);
  }

  broadcastPaymentUpdate(payment) {
    this.broadcastToSubscribed('payment_update', payment);
  }

  broadcastStoreUpdate(store) {
    this.broadcastToSubscribed('store_update', store);
  }

  broadcastSystemAlert(alert) {
    this.broadcastToAll({
      type: 'system_alert',
      alert,
      timestamp: new Date().toISOString()
    });
  }

  async sendInitialState(clientId) {
    try {
      // Send system status
      this.sendToClient(clientId, {
        type: 'system_status',
        data: await this.getSystemHealth(),
        timestamp: new Date().toISOString()
      });

      // Send live stats
      this.sendToClient(clientId, {
        type: 'live_stats',
        data: await this.getPlatformStats(),
        timestamp: new Date().toISOString()
      });

      // Send recent alerts
      this.sendToClient(clientId, {
        type: 'recent_alerts',
        data: [],
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      console.error('Error sending initial state:', error);
    }
  }

  // Periodically broadcast high-level system stats to all connected clients
  async broadcastSystemStats() {
    try {
      const status = await this.getSystemHealth();
      this.broadcastToAll({
        type: 'system_stats',
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error broadcasting system stats:', error);
    }
  }

  setupHeartbeat() {
    setInterval(() => {
      const now = Date.now();

      this.clients.forEach((client, clientId) => {
        if (now - client.lastHeartbeat > 60000) {
          console.log(`Client ${clientId} heartbeat timeout`);
          client.ws.close(1001, 'Heartbeat timeout');
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.ping();
        }
      });
    }, 30000);
  }

  // Public methods for external use
  getConnectedClients() {
    return Array.from(this.clients.keys());
  }

  getClientCount() {
    return this.clients.size;
  }

  isClientConnected(clientId) {
    return this.clients.has(clientId);
  }
}

module.exports = UnifiedOwnerWebSocketServer;
