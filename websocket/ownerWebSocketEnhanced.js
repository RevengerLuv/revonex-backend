// [file name]: ownerWebSocketEnhanced.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

class OwnerWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server, 
      path: '/ws/owner-control',
      clientTracking: true
    });
    
    this.clients = new Map(); // ownerId -> WebSocket
    this.setupConnectionHandling();
  }
  
  setupConnectionHandling() {
    this.wss.on('connection', async (ws, req) => {
      try {
        // Extract and verify token
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
        
        console.log(`✅ Owner Control Center connected: ${user.email}`);
        
        // Store connection
        this.clients.set(user._id.toString(), {
          ws,
          user,
          connectedAt: new Date(),
          lastHeartbeat: Date.now()
        });
        
        // Send welcome with initial data
        this.sendToOwner(user._id, {
          type: 'connected',
          message: 'Control Center connected',
          timestamp: new Date().toISOString(),
          sessionId: decoded.sessionId
        });
        
        // Send initial platform stats
        this.sendPlatformStats(user._id);
        
        // Setup heartbeat
        this.setupHeartbeat(ws, user._id);
        
        // Handle messages
        ws.on('message', (message) => this.handleMessage(message, user._id));
        
        // Handle disconnection
        ws.on('close', () => {
          console.log(`Owner Control Center disconnected: ${user.email}`);
          this.clients.delete(user._id.toString());
        });
        
        ws.on('error', (error) => {
          console.error('Owner WebSocket error:', error);
          this.clients.delete(user._id.toString());
        });
        
      } catch (error) {
        console.error('Control Center connection error:', error);
        ws.close(1008, 'Authentication failed');
      }
    });
  }
  
  setupHeartbeat(ws, ownerId) {
    const interval = setInterval(() => {
      const client = this.clients.get(ownerId.toString());
      
      if (!client || client.ws.readyState !== WebSocket.OPEN) {
        clearInterval(interval);
        return;
      }
      
      // Check if connection is stale
      if (Date.now() - client.lastHeartbeat > 60000) {
        client.ws.close(1001, 'Connection timeout');
        clearInterval(interval);
        return;
      }
      
      // Send heartbeat
      client.ws.ping();
    }, 30000);
    
    ws.on('pong', () => {
      const client = this.clients.get(ownerId.toString());
      if (client) {
        client.lastHeartbeat = Date.now();
      }
    });
  }
  
  async handleMessage(message, ownerId) {
    try {
      const data = JSON.parse(message);
      console.log('Control Center message:', data);
      
      const client = this.clients.get(ownerId.toString());
      if (!client) return;
      
      switch (data.type) {
        case 'subscribe':
          this.handleSubscription(data, client);
          break;
          
        case 'command':
          this.handleCommand(data, client);
          break;
          
        case 'heartbeat':
          client.lastHeartbeat = Date.now();
          break;
      }
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
    }
  }
  
  handleSubscription(data, client) {
    const { channels } = data;
    
    // Store subscribed channels
    client.subscriptions = channels || [];
    
    // Send confirmation
    this.sendToOwner(client.user._id, {
      type: 'subscription_updated',
      channels: client.subscriptions,
      timestamp: new Date().toISOString()
    });
  }
  
  handleCommand(data, client) {
    const { command, payload } = data;
    
    // Handle real-time commands
    switch (command) {
      case 'refresh_stats':
        this.sendPlatformStats(client.user._id);
        break;
        
      case 'force_logout_user':
        this.broadcastForceLogout(payload.userId);
        break;
        
      case 'emergency_alert':
        this.broadcastEmergencyAlert(payload);
        break;
    }
  }
  
  // Send message to specific owner
  sendToOwner(ownerId, data) {
    const client = this.clients.get(ownerId.toString());
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(data));
    }
  }
  
  // Broadcast to all connected owners
  broadcastToOwners(data, filter = null) {
    this.clients.forEach((client, ownerId) => {
      if (filter && !filter(client)) return;
      
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify(data));
      }
    });
  }
  
  // Broadcast specific event types based on subscriptions
  broadcastEvent(eventType, data) {
    this.clients.forEach((client, ownerId) => {
      if (!client.subscriptions || !client.subscriptions.includes(eventType)) {
        return;
      }
      
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(JSON.stringify({
          type: 'event',
          event: eventType,
          data: data,
          timestamp: new Date().toISOString()
        }));
      }
    });
  }
  
  // Send platform stats
  async sendPlatformStats(ownerId) {
    try {
      const [
        totalUsers, 
        totalStores, 
        totalOrders,
        onlineUsers,
        pendingPayments,
        systemHealth
      ] = await Promise.all([
        require('../models/User').countDocuments(),
        require('../models/Store').countDocuments(),
        require('../models/Order').countDocuments({ createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        this.getOnlineUsersCount(),
        require('../models/Transaction').countDocuments({ status: 'pending' }),
        this.getSystemHealth()
      ]);
      
      this.sendToOwner(ownerId, {
        type: 'platform_stats',
        data: {
          totalUsers,
          totalStores,
          totalOrders,
          onlineUsers,
          pendingPayments,
          systemHealth,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting platform stats:', error);
    }
  }
  
  async getOnlineUsersCount() {
    // In production, track active sessions
    // For now, return estimated count
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
  
  // Broadcast force logout to user's sessions
  broadcastForceLogout(userId) {
    // In production, implement session invalidation
    // For now, broadcast to relevant WebSocket channels
    this.broadcastEvent('user_force_logout', { userId });
  }
  
  // Broadcast emergency alert
  broadcastEmergencyAlert(payload) {
    this.broadcastToOwners({
      type: 'emergency_alert',
      level: payload.level || 'warning',
      message: payload.message,
      action: payload.action,
      timestamp: new Date().toISOString()
    });
  }
  
  // Public methods for broadcasting events
  broadcastActivity(activity) {
    this.broadcastEvent('activity', activity);
  }
  
  broadcastOrderUpdate(order) {
    this.broadcastEvent('order', {
      type: 'order_update',
      orderId: order.orderId,
      status: order.status,
      storeId: order.storeId,
      amount: order.total,
      timestamp: new Date().toISOString()
    });
  }
  
  broadcastPaymentUpdate(payment) {
    this.broadcastEvent('payment', {
      type: 'payment_update',
      transactionId: payment.transactionId,
      status: payment.status,
      amount: payment.amount,
      gateway: payment.gateway,
      timestamp: new Date().toISOString()
    });
  }
  
  broadcastSystemAlert(alert) {
    this.broadcastEvent('system_alert', alert);
  }
}

module.exports = OwnerWebSocketServer;