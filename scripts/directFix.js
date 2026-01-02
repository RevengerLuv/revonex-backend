// server/scripts/directFix.js
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function directFix() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to database');
    
    // Get direct access to the collection
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');
    
    const email = 'owner@revonex.com';
    
    // Check current state
    console.log(`\n🔍 Checking user: ${email}`);
    const user = await usersCollection.findOne({ email });
    
    if (!user) {
      console.log('❌ User not found!');
      return;
    }
    
    console.log('\n📊 Current user document:');
    console.log(JSON.stringify(user, null, 2));
    
    // Use bcryptjs (more reliable)
    const bcrypt = require('bcryptjs');
    const newPassword = 'owner123';
    
    console.log('\n🔄 Generating password hash...');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);
    
    console.log('Hash created:', hash.substring(0, 30) + '...');
    
    // Update the document directly
    console.log('\n💾 Updating database...');
    const result = await usersCollection.updateOne(
      { _id: user._id },
      { 
        $set: { 
          password: hash,
          updatedAt: new Date()
        }
      }
    );
    
    console.log('Update result:', result);
    
    // Verify the update
    console.log('\n🔍 Verifying update...');
    const updatedUser = await usersCollection.findOne({ email });
    
    console.log('\n📊 Updated user:');
    console.log('Has password:', !!updatedUser.password);
    console.log('Password length:', updatedUser.password?.length);
    console.log('Password type:', typeof updatedUser.password);
    
    if (updatedUser.password) {
      console.log('\n🧪 Testing password...');
      const isValid = await bcrypt.compare(newPassword, updatedUser.password);
      console.log('Password valid?', isValid ? '✅ YES' : '❌ NO');
      
      if (isValid) {
        console.log('\n🎉 SUCCESS! You can now login with:');
        console.log('📧 Email: owner@revonex.com');
        console.log('🔑 Password: owner123');
        console.log('👑 Role: owner');
      }
    }
    
    await mongoose.disconnect();
    console.log('\n✅ Database connection closed');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

directFix();