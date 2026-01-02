const mongoose = require('mongoose');

const withdrawalInfoSchema = new mongoose.Schema({
  storeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Store',
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    required: true
  },
  address: String,
  phone: {
    type: String,
    required: true
  },
  upiId: String,
  bankName: String,
  bankAccount: String,
  ifscCode: String,
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('WithdrawalInfo', withdrawalInfoSchema);