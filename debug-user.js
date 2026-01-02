const mongoose = require('mongoose');
require('dotenv').config();

async function debugUser() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');

    const User = require('./models/User');
    const Store = require('./models/Store');

    // Find all users with subscription data
    const users = await User.find({}).select('name email role subscription');

    console.log('🔍 DEBUGGING STORE LIMITS ISSUE');
    console.log('================================');

    console.log('Users with subscription data:');
    users.forEach(user => {
      console.log(`User: ${user.name} (${user.email})`);
      console.log(`Role: ${user.role}`);
      console.log(`Subscription: ${JSON.stringify(user.subscription, null, 2)}`);
      console.log('---');
    });

    // Check store counts and limits for each user
    console.log('\n📊 STORE LIMITS ANALYSIS:');
    console.log('==========================');

    for (const user of users) {
      const storeCount = await Store.countDocuments({
        owner: user._id,
        isActive: true,
        isBanned: { $ne: true }
      });

      // Calculate limits based on subscription (same logic as storeLimits.js)
      const userPlan = (user.subscription && user.subscription.plan) ? user.subscription.plan : 'free';
      const planLimits = {
        free: 5,
        starter: 15,
        pro: 30
      };
      const maxStores = planLimits[userPlan] || 5;
      const canCreate = storeCount < maxStores;

      console.log(`👤 User: ${user.name} (${user.email})`);
      console.log(`📋 Plan: ${userPlan}`);
      console.log(`🏪 Current Stores: ${storeCount}`);
      console.log(`🎯 Max Stores: ${maxStores}`);
      console.log(`✅ Can Create: ${canCreate}`);
      console.log(`📈 Subscription Object: ${JSON.stringify(user.subscription, null, 2)}`);
      console.log('---');
    }

    // Check if there are any users with specific email patterns
    console.log('\n🔎 SPECIFIC USER CHECK:');
    console.log('=======================');

    const specificUsers = await User.find({
      email: { $regex: /test|demo|user/i }
    }).select('name email role subscription');

    if (specificUsers.length > 0) {
      specificUsers.forEach(user => {
        console.log(`Found user: ${user.name} (${user.email}) - Plan: ${(user.subscription && user.subscription.plan) || 'free'}`);
      });
    } else {
      console.log('No test/demo users found');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

debugUser();
