const mongoose = require('mongoose')

const AnalyticsEventSchema = new mongoose.Schema({
  storeId: String,
  type: {
    type: String,
    enum: ['page_view', 'product_view', 'checkout', 'purchase']
  },
  path: String,
  productId: mongoose.Schema.Types.ObjectId,
  ip: String,
  userAgent: String,
  createdAt: { type: Date, default: Date.now }
})

module.exports = mongoose.model('AnalyticsEvent', AnalyticsEventSchema)
