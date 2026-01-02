// server/scripts/createAdmin.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');

async function createAdmin() {
  try {
    console.log('🔗 Connecting to database...');
    
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: 'admin@revonex.com' });
    if (existingAdmin) {
      console.log('\n📊 Admin account already exists:');
      console.log('   Email:', existingAdmin.email);
      console.log('   Role:', existingAdmin.role);
      console.log('   Name:', existingAdmin.name);
      console.log('\n✅ No changes needed');
      await mongoose.disconnect();
      return;
    }
    
    console.log('👨‍💼 Creating admin account...');
    
    // Create admin account
    const hashedPassword = await bcrypt.hash('admin123', 12);
    const admin = new User({
      name: 'System Administrator',
      email: 'admin@revonex.com',
      password: hashedPassword,
      role: 'admin',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    await admin.save();
    
    console.log('\n🎉 ADMIN ACCOUNT CREATED SUCCESSFULLY!');
    console.log('=======================================');
    console.log('📧 Email:    admin@revonex.com');
    console.log('🔑 Password: admin123');
    console.log('👨‍💼 Role:     admin');
    console.log('👤 Name:     System Administrator');
    console.log('\n⚠️  IMPORTANT: Change password after first login!');
    console.log('=======================================');
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    process.exit(1);
  }
}

// Run the function
createAdmin();