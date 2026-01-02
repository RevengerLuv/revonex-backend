const mongoose = require('mongoose');
const Product = require('./models/Products');

async function checkProducts() {
  try {
    await mongoose.connect('mongodb://localhost:27017/revonex', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('🔍 Checking recent products...');

    const products = await Product.find({})
      .limit(10)
      .sort({ createdAt: -1 })
      .populate('store', 'storeName storeSlug');

    console.log(`Found ${products.length} products:`);
    products.forEach(p => {
      console.log(`ID: ${p._id}`);
      console.log(`  Name: ${p.name}`);
      console.log(`  Type: ${p.type}`);
      console.log(`  Status: ${p.status}`);
      console.log(`  Store: ${p.store?.storeName || p.store} (${p.store?.storeSlug || 'no slug'})`);
      console.log(`  Created: ${p.createdAt}`);
      console.log('---');
    });

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkProducts();
