const mongoose = require('mongoose');

const systemLogSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  severity: {
    type: String,
    enum: ['info', 'low', 'medium', 'high', 'critical'],
    default: 'info',
    index: true
  },
  params: mongoose.Schema.Types.Mixed,
  metadata: mongoose.Schema.Types.Mixed,
  ip: String,
  userAgent: String,
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

systemLogSchema.index({ severity: 1, timestamp: -1 });

module.exports = mongoose.model('SystemLog', systemLogSchema);
