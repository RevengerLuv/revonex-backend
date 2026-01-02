// server/scripts/verifyOwner.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

async function verifyOwner() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    const owner = await User.findOne({ email: 'owner@revonex.com' });
    
    if (!owner) {
      console.log('❌ Owner account not found!');
      console.log('Run: node server/scripts/recreateOwner.js');
      return;
    }
    
    console.log('\n📊 Owner account found:');
    console.log('Email:', owner.email);
    console.log('Role:', owner.role);
    console.log('Name:', owner.name);
    console.log('ID:', owner._id);
    console.log('Is Active:', owner.isActive);
    console.log('Email Verified:', owner.emailVerified);
    
    // Check password field
    console.log('\n🔑 Password field:');
    console.log('Has password:', !!owner.password);
    console.log('Password length:', owner.password?.length);
    console.log('Starts with $2? (bcrypt hash):', owner.password?.startsWith('$2'));
    
    // Test login via API
    console.log('\n🧪 Test login with:');
    console.log('Email: owner@revonex.com');
    console.log('Password: owner123');
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('Error:', error);
  }
}

verifyOwner();