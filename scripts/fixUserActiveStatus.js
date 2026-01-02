const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config();

async function fixUserActiveStatus() {
  try {
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');

    console.log('🔄 Updating existing users to set isActive: true...');

    // Update all users that don't have isActive field set
    const result = await User.updateMany(
      { isActive: { $exists: false } }, // Only update users where isActive doesn't exist
      { $set: { isActive: true } }
    );

    console.log(`✅ Updated ${result.modifiedCount} users to active status`);

    // Also ensure all users are active (in case some were set to false)
    const activeResult = await User.updateMany(
      { isActive: false },
      { $set: { isActive: true } }
    );

    console.log(`✅ Activated ${activeResult.modifiedCount} previously deactivated users`);

    // Show total active users
    const totalActive = await User.countDocuments({ isActive: true });
    console.log(`📊 Total active users: ${totalActive}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error updating users:', error);
    process.exit(1);
  }
}

fixUserActiveStatus();
