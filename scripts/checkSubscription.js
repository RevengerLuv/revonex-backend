const mongoose = require('mongoose');
const User = require('../models/User');

// Connect to database
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');
    console.log('MongoDB connected');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

const checkUserSubscription = async (email) => {
  try {
    const user = await User.findOne({ email: email }).select('email subscription');

    if (!user) {
      console.log(`User with email ${email} not found`);
      return;
    }

    console.log(`User: ${user.email}`);
    console.log(`Subscription:`, JSON.stringify(user.subscription, null, 2));

    if (user.subscription) {
      const now = new Date();
      const endDate = new Date(user.subscription.endDate);
      const isActive = user.subscription.status === 'active';
      const isExpired = now > endDate;
      const isPro = user.subscription.plan?.toLowerCase() === 'pro';

      console.log(`Plan: ${user.subscription.plan}`);
      console.log(`Status: ${user.subscription.status}`);
      console.log(`Is Active: ${isActive}`);
      console.log(`Is Expired: ${isExpired}`);
      console.log(`Is Pro Plan: ${isPro}`);
      console.log(`End Date: ${endDate}`);
      console.log(`Current Time: ${now}`);
      console.log(`Can Purchase Domains: ${isActive && !isExpired && isPro}`);
    } else {
      console.log('No subscription found');
    }

  } catch (error) {
    console.error('Error checking user:', error);
  }
};

const main = async () => {
  const email = process.argv[2];

  if (!email) {
    console.log('Usage: node checkSubscription.js <email>');
    console.log('Example: node checkSubscription.js user@example.com');
    process.exit(1);
  }

  await connectDB();
  await checkUserSubscription(email);
  process.exit(0);
};

main();
