// server/scripts/fixOwnerAccount.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

async function fixOwnerAccount() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    const email = 'owner@revonex.com';
    const password = 'owner123';
    
    console.log(`\n🔍 Finding user: ${email}`);
    
    // Find the user
    let user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found, creating new owner account...');
      user = new User({
        name: 'Platform Owner',
        email: 'owner@revonex.com',
        role: 'owner',
        emailVerified: true,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    console.log('\n📊 Current user data:');
    console.log('ID:', user._id);
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Current Role:', user.role);
    console.log('Has password:', !!user.password);
    
    // Fix the role
    user.role = 'owner';
    
    // Fix the password if missing
    if (!user.password) {
      console.log('\n🔑 Creating new password...');
      const salt = await bcrypt.genSalt(12);
      const hash = await bcrypt.hash(password, salt);
      user.password = hash;
      console.log('Password hash created');
    }
    
    user.updatedAt = new Date();
    
    await user.save();
    
    console.log('\n✅ Owner account fixed!');
    console.log('New Role:', user.role);
    console.log('Has password:', !!user.password);
    console.log('Password hash length:', user.password?.length);
    
    // Verify password works
    const isValid = await bcrypt.compare(password, user.password);
    console.log('\n🧪 Password test:', isValid ? '✅ PASS' : '❌ FAIL');
    
    if (isValid) {
      console.log('\n🎉 READY TO LOGIN!');
      console.log('===================');
      console.log('Email: owner@revonex.com');
      console.log('Password: owner123');
      console.log('Role: owner');
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

fixOwnerAccount();