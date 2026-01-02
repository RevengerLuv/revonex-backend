// [file name]: enhancedWebSocketServer.js
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

class EnhancedWebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ 
      server, 
      path: '/ws/owner-master',
      clientTracking: true
    });
    
    this.clients = new Map();
    this.subscriptions = new Map();
    this.setupConnectionHandling();
    
    // Setup heartbeat
    this.setupHeartbeat();
    
    // Broadcast system stats every 30 seconds
    setInterval(() => this.broadcastSystemStats(), 30000);
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
        
        if (decoded.role !== 'owner') {
          ws.close(1008, 'Owner access required');
          return;
        }
        
        const clientId = decoded.userId || decoded.id;
        
        this.clients.set(clientId, {
          ws,
          user: decoded,
          connectedAt: new Date(),
          lastHeartbeat: Date.now(),
          subscriptions: new Set()
        });
        
        // Send welcome message
        this.sendToClient(clientId, {
          type: 'connected',
          message: 'Master control center connected',
          clientId,
          timestamp: new Date().toISOString(),
          capabilities: [
            'system_control',
            'user_management',
            'store_management',
            'financial_control',
            'real_time_monitoring',
            'command_execution'
          ]
        });
        
        // Send initial system state
        this.sendInitialState(clientId);
        
        // Handle messages
        ws.on('message', (message) => this.handleMessage(message, clientId));
        
        // Handle disconnection
        ws.on('close', () => {
          console.log(`Client ${clientId} disconnected`);
          this.clients.delete(clientId);
        });
        
        ws.on('error', (error) => {
          console.error(`Client ${clientId} error:`, error);
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
  
  async handleCommand(data, clientId) {
    const { command, payload, requestId } = data;
    const client = this.clients.get(clientId);
    
    try {
      // Execute command through API
      const result = await this.executeCommand(command, payload, client.user);
      
      // Send result back to requester
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
        result: {
          success: true,
          command
        }
      }, [clientId]); // Exclude the executor
      
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
    // This would call your actual API endpoints
    // For now, return mock data
    return {
      executed: true,
      command,
      by: user.email,
      timestamp: new Date().toISOString()
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
  
  broadcastForceLogout(userId) {
    this.broadcastToAll({
      type: 'force_logout',
      userId,
      timestamp: new Date().toISOString()
    });
  }
  
  async sendInitialState(clientId) {
    // Send system status
    this.sendToClient(clientId, {
      type: 'system_status',
      data: await this.getSystemStatus(),
      timestamp: new Date().toISOString()
    });
    
    // Send live stats
    this.sendToClient(clientId, {
      type: 'live_stats',
      data: await this.getLiveStats(),
      timestamp: new Date().toISOString()
    });
    
    // Send recent alerts
    this.sendToClient(clientId, {
      type: 'recent_alerts',
      data: await this.getRecentAlerts(),
      timestamp: new Date().toISOString()
    });
  }
  
  async getSystemStatus() {
    // Implement actual system status check
    return {
      database: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
      redis: 'healthy',
      api: 'healthy',
      websocket: 'healthy',
      uptime: process.uptime(),
      memory: process.memoryUsage().heapUsed / 1024 / 1024,
      timestamp: new Date().toISOString()
    };
  }

  // Periodically broadcast high-level system stats to all connected clients
  async broadcastSystemStats() {
    try {
      const status = await this.getSystemStatus();
      this.broadcastToAll({
        type: 'system_stats',
        data: status,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Error broadcasting system stats:', error);
    }
  }

  // Lightweight placeholders so initial state calls don't crash
  async getLiveStats() {
    return {
      activeConnections: this.clients?.size || 0,
      timestamp: new Date().toISOString(),
    };
  }

  async getRecentAlerts() {
    // In a full implementation, fetch recent alert records from your datastore
    return [];
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
}

module.exports = EnhancedWebSocketServer;