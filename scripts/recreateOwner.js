// server/scripts/recreateOwner.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function recreateOwner() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');
    
    // Get the Users collection directly
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    // Delete existing owner
    await usersCollection.deleteOne({ email: 'owner@revonex.com' });
    console.log('🗑️  Old owner account deleted');
    
    // Manually create the document with correct structure
    // Using the same bcrypt that your User model uses
    const bcrypt = require('bcrypt');
    const hash = await bcrypt.hash('owner123', 10);
    
    const ownerDoc = {
      name: 'Platform Owner',
      email: 'owner@revonex.com',
      password: hash,
      role: 'owner',
      emailVerified: true,
      isActive: true,
      isBanned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      __v: 0
    };
    
    // Insert directly
    const result = await usersCollection.insertOne(ownerDoc);
    console.log('✅ New owner created with ID:', result.insertedId);
    
    // Verify
    const savedOwner = await usersCollection.findOne({ email: 'owner@revonex.com' });
    console.log('\n📊 Saved owner details:');
    console.log('Email:', savedOwner.email);
    console.log('Role:', savedOwner.role);
    console.log('Password hash length:', savedOwner.password?.length);
    console.log('Password hash (first 30 chars):', savedOwner.password?.substring(0, 30));
    
    // Test password
    const isValid = await bcrypt.compare('owner123', savedOwner.password);
    console.log('\n🧪 Password test:', isValid ? '✅ PASS' : '❌ FAIL');
    
    if (isValid) {
      console.log('\n🎉 READY TO LOGIN!');
      console.log('===================');
      console.log('Email: owner@revonex.com');
      console.log('Password: owner123');
    }
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Error:', error.message);
    
    // Try with bcryptjs as fallback
    if (error.message.includes('Cannot find module')) {
      console.log('\n🔄 Trying with bcryptjs...');
      await tryWithBcryptjs();
    }
  }
}

async function tryWithBcryptjs() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex');
    
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash('owner123', 10);
    
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    await usersCollection.deleteOne({ email: 'owner@revonex.com' });
    
    const ownerDoc = {
      name: 'Platform Owner',
      email: 'owner@revonex.com',
      password: hash,
      role: 'owner',
      emailVerified: true,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await usersCollection.insertOne(ownerDoc);
    
    console.log('✅ Owner created with bcryptjs');
    console.log('Email: owner@revonex.com');
    console.log('Password: owner123');
    
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Bcryptjs also failed:', error);
  }
}

recreateOwner();