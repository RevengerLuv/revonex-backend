// server/scripts/fixOwnerPassword.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

// Try bcrypt first, fall back to bcryptjs
let bcrypt;
try {
  bcrypt = require('bcrypt');
  console.log('✅ Using native bcrypt module');
} catch (error) {
  console.log('⚠️ Native bcrypt not found, using bcryptjs');
  bcrypt = require('bcryptjs');
}

async function fixOwnerPassword() {
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
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('\n📊 Current user data:');
    console.log('ID:', user._id);
    console.log('Name:', user.name);
    console.log('Email:', user.email);
    console.log('Role:', user.role);
    console.log('Has password field:', user.password ? '✅ Yes' : '❌ No');
    console.log('Password type:', typeof user.password);
    
    // Check what's actually in the password field
    if (user.password) {
      console.log('Password value:', user.password);
      console.log('Password length:', user.password.length);
      console.log('Looks like bcrypt hash?', user.password.startsWith('$2') ? '✅ Yes' : '❌ No');
    }
    
    // Delete the current password and create a new one
    console.log('\n🔄 Creating new password...');
    
    // Generate salt and hash
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    
    console.log('New hash created:', hash.substring(0, 30) + '...');
    
    // Update the user
    user.password = hash;
    user.updatedAt = new Date();
    
    await user.save();
    
    console.log('\n✅ Password updated!');
    
    // Verify
    console.log('\n🧪 Verifying new password...');
    const verifiedUser = await User.findOne({ email });
    const isValid = await bcrypt.compare(password, verifiedUser.password);
    
    console.log('Password valid?', isValid ? '✅ YES' : '❌ NO');
    
    if (isValid) {
      console.log('\n🎉 SUCCESS! Login with:');
      console.log('📧 Email: owner@revonex.com');
      console.log('🔑 Password: owner123');
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

fixOwnerPassword();