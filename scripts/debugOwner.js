// server/scripts/debugOwner.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function debugOwner() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    // Get the User model
    const User = require('../models/User');
    
    const email = 'owner@revonex.com';
    
    // Check current state - select password field explicitly
    console.log(`\n🔍 Checking user: ${email}`);
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      console.log('❌ User not found! Creating owner user...');
      
      // Create owner user if doesn't exist
      const bcrypt = require('bcryptjs');
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash('owner123', salt);
      
      const newOwner = await User.create({
        name: 'System Owner',
        email: 'owner@revonex.com',
        password: hash,
        role: 'owner',
        emailVerified: true,
        isActive: true
      });
      
      console.log('✅ Owner user created!');
      console.log('📧 Email:', newOwner.email);
      console.log('👑 Role:', newOwner.role);
      console.log('🆔 ID:', newOwner._id);
      
      await mongoose.disconnect();
      return;
    }
    
    console.log('\n📊 User found:');
    console.log('- Name:', user.name);
    console.log('- Email:', user.email);
    console.log('- Role:', user.role);
    console.log('- Active:', user.isActive);
    console.log('- Banned:', user.isBanned);
    console.log('- Email Verified:', user.emailVerified);
    console.log('- Has password:', !!user.password);
    console.log('- Password length:', user.password?.length);
    console.log('- Created:', user.createdAt);
    
    // Test the password with bcrypt
    console.log('\n🧪 Testing password "owner123"...');
    const bcrypt = require('bcryptjs');
    const isValid = await bcrypt.compare('owner123', user.password);
    console.log('✅ Password valid?', isValid ? 'YES' : 'NO');
    
    if (!isValid) {
      console.log('\n🔄 Resetting password...');
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash('owner123', salt);
      
      user.password = newHash;
      await user.save();
      
      console.log('✅ Password reset to "owner123"');
    }
    
    // Check if any other users exist
    console.log('\n👥 All users in database:');
    const allUsers = await User.find({}).select('name email role isActive');
    console.log('Count:', allUsers.length);
    allUsers.forEach(u => {
      console.log(`- ${u.name} (${u.email}) - Role: ${u.role} - Active: ${u.isActive}`);
    });
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

debugOwner();