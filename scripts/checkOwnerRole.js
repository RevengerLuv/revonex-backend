// server/scripts/checkOwnerRole.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function checkOwnerRole() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    
    const User = require('../models/User');
    const owner = await User.findOne({ email: 'owner@revonex.com' });
    
    console.log('🔍 Owner account details:');
    console.log('Email:', owner?.email);
    console.log('Role:', owner?.role);
    console.log('Exact role value:', JSON.stringify(owner?.role));
    console.log('Type of role:', typeof owner?.role);
    console.log('Is role === "owner"?', owner?.role === 'owner');
    
    if (owner && owner.role === 'owner') {
      console.log('✅ Owner role is correctly set to "owner"');
    } else {
      console.log('❌ Owner role is NOT "owner". Actual role:', owner?.role);
      console.log('📝 Fixing role...');
      
      owner.role = 'owner';
      await owner.save();
      console.log('✅ Role fixed to "owner"');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkOwnerRole();