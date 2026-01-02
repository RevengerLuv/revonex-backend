const mongoose = require('mongoose');
const Store = require('./models/Store');
const Withdrawal = require('./models/Withdrawal');
const Transaction = require('./models/Transaction');

async function checkBalances() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');

    console.log('=== STORE BALANCES ===');
    const stores = await Store.find({}).select('storeName balance owner');
    for (const store of stores) {
      console.log(`${store.storeName}: $${store.balance || 0}`);
    }

    console.log('\n=== PENDING WITHDRAWALS ===');
    const pendingWithdrawals = await Withdrawal.find({ status: { $in: ['pending', 'approved'] } })
      .populate('storeId', 'storeName')
      .select('amount status storeId');

    for (const withdrawal of pendingWithdrawals) {
      console.log(`Store: ${withdrawal.storeId?.storeName}, Amount: $${withdrawal.amount}, Status: ${withdrawal.status}`);
    }

    console.log('\n=== RECENT TRANSACTIONS ===');
    const transactions = await Transaction.find({ type: 'store_payment' })
      .populate('store', 'storeName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('amount store createdAt');

    for (const tx of transactions) {
      console.log(`Store: ${tx.store?.storeName}, Amount: $${tx.amount}, Date: ${tx.createdAt}`);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkBalances();
