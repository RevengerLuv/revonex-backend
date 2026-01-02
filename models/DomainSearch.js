// server/models/DomainSearch.js
const mongoose = require('mongoose');

const domainSearchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  query: {
    type: String,
    required: true
  },
  tld: {
    type: String,
    default: '.com'
  },
  results: [{
    domain: String,
    available: Boolean,
    price: Number
  }],
  timestamp: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

domainSearchSchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('DomainSearch', domainSearchSchema);