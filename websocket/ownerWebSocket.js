const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const setupOwnerWebSocket = (server) => {
  const wss = new WebSocket.Server({ 
    server,
    path: '/ws/owner'
  });

  wss.on('connection', async (ws, req) => {
    try {
      // Extract token from URL query
      const token = new URL(req.url, `http://${req.headers.host}`).searchParams.get('token');
      
      if (!token) {
        ws.close(1008, 'Authentication required');
        return;
      }

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId);

      if (!user || user.role !== 'owner') {
        ws.close(1008, 'Owner access required');
        return;
      }

      console.log(`✅ Owner WebSocket connected: ${user.email}`);

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        message: 'Owner WebSocket connected',
        timestamp: new Date().toISOString()
      }));

      // Heartbeat
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'heartbeat',
            timestamp: new Date().toISOString()
          }));
        }
      }, 30000);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          console.log('Owner WebSocket message:', data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeatInterval);
        console.log(`Owner WebSocket disconnected: ${user.email}`);
      });

      ws.on('error', (error) => {
        console.error('Owner WebSocket error:', error);
      });

    } catch (error) {
      console.error('WebSocket connection error:', error);
      ws.close(1008, 'Authentication failed');
    }
  });

  // Function to broadcast to all connected owners
  const broadcastToOwners = (data) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  return { wss, broadcastToOwners };
};

module.exports = setupOwnerWebSocket;