// server/scripts/fixOwnerRole.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixOwnerRole() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    const User = require('../models/User');
    const email = 'owner@revonex.com';
    
    // Find the owner account
    const owner = await User.findOne({ email });
    
    if (!owner) {
      console.log('❌ Owner account not found!');
      return;
    }
    
    console.log('\n📊 BEFORE FIX:');
    console.log('Email:', owner.email);
    console.log('Current Role:', owner.role);
    console.log('Name:', owner.name);
    
    // Update the role to 'owner'
    owner.role = 'owner';
    owner.updatedAt = new Date();
    
    await owner.save();
    
    console.log('\n✅ AFTER FIX:');
    console.log('Email:', owner.email);
    console.log('New Role:', owner.role);
    console.log('Name:', owner.name);
    
    // Verify the change
    const updatedOwner = await User.findOne({ email });
    console.log('\n🔍 VERIFICATION:');
    console.log('Role verified:', updatedOwner.role === 'owner' ? '✅ Yes' : '❌ No');
    
    console.log('\n🎉 Owner role fixed!');
    console.log('Login again to see the owner panel.');
    
    await mongoose.disconnect();
    console.log('✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixOwnerRole();