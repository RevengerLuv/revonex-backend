// Utility for broadcasting real-time dashboard updates
// Uses EventEmitter to communicate between modules

const EventEmitter = require('events');

class DashboardUpdateEmitter extends EventEmitter {}
const dashboardUpdateEmitter = new DashboardUpdateEmitter();

// Emit dashboard update event
exports.broadcastDashboardUpdate = async (userId, storeId = null) => {
  dashboardUpdateEmitter.emit('dashboard-update', { userId, storeId });
};

// Get the emitter so server.js can listen to events
exports.getEmitter = () => dashboardUpdateEmitter;

