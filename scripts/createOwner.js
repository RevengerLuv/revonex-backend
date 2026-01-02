// server/scripts/createOwner.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Since we're in scripts directory, we need to go up one level
const User = require('../models/User');

async function createOwner() {
  try {
    console.log('🔗 Connecting to database...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    // Check if owner already exists
    const existingOwner = await User.findOne({ email: 'owner@revonex.com' });
    if (existingOwner) {
      console.log('\n📊 Owner account already exists:');
      console.log('   Email:', existingOwner.email);
      console.log('   Role:', existingOwner.role);
      console.log('   Name:', existingOwner.name);
      console.log('\n✅ No changes needed');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👑 Creating owner account...');
    
    // Create owner account
    const hashedPassword = await bcrypt.hash('owner123', 12);
    const owner = new User({
      name: 'Platform Owner',
      email: 'owner@revonex.com',
      password: hashedPassword,
      role: 'owner',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await owner.save();
    
    console.log('\n🎉 OWNER ACCOUNT CREATED SUCCESSFULLY!');
    console.log('=======================================');
    console.log('📧 Email:    owner@revonex.com');
    console.log('🔑 Password: owner123');
    console.log('👑 Role:     owner');
    console.log('👤 Name:     Platform Owner');
    console.log('\n⚠️  IMPORTANT: Change password after first login!');
    console.log('=======================================');
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error creating owner:', error);
    process.exit(1);
  }
}

// Run the function
createOwner();