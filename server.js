const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cookieParser = require('cookie-parser');
// Add near other imports in server.js
const paymentController = require('./controllers/paymentController');
const orderController = require('./controllers/orderController');
const productRoutes = require('./routes/products');
const bodyParser = require("body-parser");
const paymentRoutes = require('./routes/payments');
const setupOwnerWebSocket = require('./websocket/ownerWebSocket');
const { createInvoice, nowpaymentsWebhook } = require('./controllers/nowpayments');
require('dotenv').config();
const passport = require('passport');
const updateSubscriptionRoutes = require('./routes/updateSubscription');
const session = require('express-session');
require('./config/passport');
const { sendDeliveryEmail } = require('./utils/emailService');
const couponRoutes = require('./routes/couponRoutes');
const analyticsRoutes = require('./routes/analytics');
const profileRoutes = require('./routes/profile');
const trackActivity = require('./middleware/activityTracker');
const dashboardRoutes = require('./routes/dashboardRoutes');
const ownerRoutes = require('./routes/owner');
const masterOwnerRoutes = require('./routes/masterOwnerRoutes');
const storeLimitsRoutes = require('./routes/storeLimits');
const productLimitsRoutes = require('./routes/productLimits');
const withdrawalRoutes = require('./routes/withdrawalRoutes');
const app = express();
const EnhancedWebSocketServer = require('./websocket/enhancedWebSocketServer');
const adminRoutes = require('./routes/admin');
const subscriptionRoutes = require('./routes/subscription');
const { auth } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const googleAuthRoutes = require('./routes/googleAuth');
const domainRoutes = require('./routes/domain');
const DomainOrder = require('./models/DomainOrder');
const DomainSearch = require('./models/DomainSearch');
const godaddyRoutes = require('./routes/godaddy');
const ownerDomainRequestsRoutes = require('./routes/ownerDomainRequests');
// Middleware - CORS must be first
app.use(cors({
  origin: 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With']
}));

app.use(cookieParser());
app.use(express.json());
app.use('/uploads', express.static('uploads'));
app.use('/api/domains', domainRoutes);
app.use('/api/owner/domain-requests', ownerDomainRequestsRoutes);
app.use('/api/owner', ownerDomainRequestsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/withdrawals', withdrawalRoutes);
// Master owner routes
app.use('/api/owner/master', masterOwnerRoutes);
app.use('/api/subscription', subscriptionRoutes);
app.use('/api/profile', profileRoutes);
app.use('/uploads', express.static('uploads'));
app.use('/api/domains/godaddy', godaddyRoutes);
// Mount GoDaddy routes
app.use('/api/godaddy', require('./routes/godaddy'));
// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-super-secret-session-key-change-this-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Remove the incorrectly placed line from here:
// app.use('/api', storeRoutes); // Add this line right after product routes
app.use(passport.initialize());
app.use(passport.session());


// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Configure GridFS for MongoDB storage
// Simple disk storage for development
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create uploads directory if it doesn't exist
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});
app.use('/api/auth', googleAuthRoutes);
// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/digital_marketplace')
.then(() => {
  console.log('✅ MongoDB Connected');
  console.log('📊 Database:', mongoose.connection.name);
  console.log('📍 Host:', mongoose.connection.host);
  
  // Add GridFS file download route
  app.get('/api/files/:id', async (req, res) => {
    try {
      const conn = mongoose.connection;
      const bucket = new mongoose.mongo.GridFSBucket(conn.db, { bucketName: 'uploads' });
      
      const fileId = new mongoose.Types.ObjectId(req.params.id);
      const file = await conn.db.collection('uploads.files').findOne({ _id: fileId });
      
      if (!file) {
        return res.status(404).json({ error: 'File not found' });
      }
      
      res.set('Content-Type', file.contentType);
      res.set('Content-Disposition', `inline; filename="${file.filename}"`);
      
      const downloadStream = bucket.openDownloadStream(fileId);
      downloadStream.pipe(res);
      
      downloadStream.on('error', () => {
        res.status(500).json({ error: 'Error streaming file' });
      });
    } catch (err) {
      console.error('Error serving file:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
})
.catch(err => {
  console.error('❌ MongoDB Connection Error:', err.message);
  process.exit(1);
});

// const productRoutes = require('./routes/product');
const storeRoutes = require('./routes/stores')(upload);
app.use('/api', couponRoutes);
// Add the store routes mounting here, after the variable is defined:
// Mount storeLimitsRoutes first to avoid conflicts with /:slug routes
app.use('/api/stores', storeLimitsRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/products', productLimitsRoutes);

// Mount product routes
app.use('/api/products', productRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/subscription', require('./routes/subscription'));
// Use central model files to avoid re-defining schemas here
const User = require('./models/User');
const Store = require('./models/Store');
const Product = require('./models/Products');
const Order = require('./models/Order');
const Transaction = require('./models/Transaction');

const getAvatarEmoji = (name) => {
  const emojis = ['👨‍💻', '👩‍🎨', '👨‍🎤', '👩‍🔬', '👨‍🚀', '👩‍💼', '👨‍🍳', '👩‍🌾', '👨‍🏫', '👩‍🚒'];
  const index = name ? name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
  return emojis[index % emojis.length];
};

// Generate unique store slug
const generateStoreSlug = (storeName) => {
  return storeName
.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) + '-' + Math.random().toString(36).substr(2, 5);
};
// Middleware to verify token
const verifyToken = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false, 
        error: 'Access denied. No token provided.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      error: 'Invalid or expired token.' 
    });
  }
};
app.use('/api/payments', paymentRoutes);
// Admin middleware
const isAdmin = (req, res, next) => {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ 
      success: false, 
      error: 'Access denied. Admin privileges required.' 
    });
  }
  next();
};

// Store owner middleware
const isStoreOwner = async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (user.role !== 'store_owner' && user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied. Store owner privileges required.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

app.use('/api', trackActivity());
app.use('/api/owner', ownerRoutes);
app.use('/api/withdrawal', withdrawalRoutes);
app.use('/api/product-limits', productLimitsRoutes);
app.use('/api/update-subscription', updateSubscriptionRoutes);
app.use('/api/update-subscription', require('./routes/updateSubscription'));
app.use((err, req, res, next) => {
  if (req.path.startsWith('/api/owner')) {
    console.error('Owner route error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  } else {
    next(err);
  }
});
// ==================== ROUTES ====================

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working!',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});


// const paymentRoutes = require('./routes/payments');
app.use("/api", paymentRoutes);
// Add wallet address
app.put('/api/stores/:storeId/wallet', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const { cryptoWallet, cryptoPaymentEnabled, paymentMethods, preferredCryptoCurrency = 'btc' } = req.body;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: req.userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Update wallet info
    if (cryptoWallet) {
      store.cryptoWallet = cryptoWallet;
    }
    
    if (cryptoPaymentEnabled !== undefined) {
      store.cryptoPaymentEnabled = cryptoPaymentEnabled;
    }
    
    if (preferredCryptoCurrency) {
      store.preferredCryptoCurrency = preferredCryptoCurrency;
    }
    
    // Update paymentMethods if provided, or sync cryptoWallet to paymentMethods
    if (paymentMethods && paymentMethods.crypto) {
      // If paymentMethods is provided, use it
      store.paymentMethods = paymentMethods;
    } else if (cryptoWallet && store.cryptoWallet) {
      // Sync cryptoWallet to paymentMethods structure
      if (!store.paymentMethods || typeof store.paymentMethods !== 'object') {
        store.paymentMethods = {};
      }
      if (!store.paymentMethods.crypto) {
        store.paymentMethods.crypto = {};
      }
      if (!store.paymentMethods.crypto.wallets) {
        store.paymentMethods.crypto.wallets = {};
      }
      
      // Add cryptoWallet to paymentMethods for the preferred currency
      const coin = preferredCryptoCurrency || store.preferredCryptoCurrency || 'btc';
      store.paymentMethods.crypto.wallets[coin] = store.cryptoWallet;
      
      if (!store.paymentMethods.crypto.selected) {
        store.paymentMethods.crypto.selected = [coin];
      } else if (!store.paymentMethods.crypto.selected.includes(coin)) {
        store.paymentMethods.crypto.selected.push(coin);
      }
      
      console.log('🔄 Synced cryptoWallet to paymentMethods:', {
        coin,
        wallet: store.cryptoWallet.substring(0, 10) + '...'
      });
    }
    
    await store.save();
    
    res.json({
      success: true,
      message: 'Crypto wallet updated successfully',
      data: {
        cryptoWallet: store.cryptoWallet,
        cryptoPaymentEnabled: store.cryptoPaymentEnabled,
        preferredCryptoCurrency: store.preferredCryptoCurrency,
        paymentMethods: store.paymentMethods
      }
    });
    
  } catch (error) {
    console.error('Update wallet error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update wallet',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
// ==================== PAYMENT ROUTES ====================
app.post('/api/create-invoice', verifyToken, createInvoice);
app.post('/api/nowpayments/webhook', nowpaymentsWebhook);
// Create order
app.post('/api/orders/create', verifyToken, async (req, res) => {
  try {
    const { storeId, items, customer, total, currency = 'INR' } = req.body;
    
    console.log('📦 Creating order:', { storeId, itemsCount: items?.length, total, customer: customer?.email });
    
    // Validate required fields
    if (!storeId || !items || !customer || !total) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: storeId, items, customer, total'
      });
    }
    // Add this to your server.js to debug routes:
console.log('🔍 Registered Routes:');
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    console.log(`  ${Object.keys(middleware.route.methods)} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    middleware.handle.stack.forEach((handler) => {
      if (handler.route) {
        console.log(`  ${Object.keys(handler.route.methods)} /api${handler.route.path}`);
      }
    });
  }
});
    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items must be a non-empty array'
      });
    }
    
    // Validate customer
    if (!customer.name || !customer.email) {
      return res.status(400).json({
        success: false,
        error: 'Customer name and email are required'
      });
    }
    
    // Verify store exists
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }
    
    // Generate order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Convert storeId to ObjectId for store field
    const mongoose = require('mongoose');
    const storeObjectId = mongoose.Types.ObjectId.isValid(storeId) 
      ? new mongoose.Types.ObjectId(storeId) 
      : store._id;
    
    // Create order in database
    const order = await Order.create({
      orderId,
      storeId: storeId.toString(), // Keep as string
      store: storeObjectId, // ObjectId reference
      items,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || ''
      },
      total: parseFloat(total),
      currency: currency || 'INR',
      status: 'pending',
      paymentStatus: 'pending',
      userId: req.userId,
      createdAt: new Date()
    });
    
    console.log('✅ Order created successfully:', order.orderId);
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        orderId: order.orderId,
        amount: order.total,
        currency: order.currency,
        storeId: order.storeId
      }
    });
    
  } catch (error) {
    console.error('❌ Create order error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
app.use(
  "/api/nowpayments/webhook",
  express.raw({ type: "application/json" })
);
app.use(bodyParser.json());

app.post('/api/payments/razorpay/create', verifyToken, async (req, res) => {
  try {
    const { orderId, amount, currency = 'INR', storeId } = req.body;
    
    console.log('💳 Creating Razorpay payment for order:', orderId);
    
    if (!orderId || !amount || !storeId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, amount, storeId'
      });
    }
    
    // 1. Find the order in database
    const order = await Order.findOne({ orderId: orderId });
    
    if (!order) {
      console.log('❌ Order not found:', orderId);
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    console.log('✅ Order found:', order._id);
    
    // 2. Convert amount to paise
    const amountInPaise = Math.round(amount * 100);
    
    const options = {
      amount: amountInPaise,
      currency: currency,
      receipt: `receipt_${orderId}`,
      payment_capture: 1,
      notes: {
        orderId: orderId,
        storeId: storeId,
        userId: req.userId
      }
    };
    
    // 3. Create Razorpay order
    const razorpay = require('razorpay');
    const razorpayInstance = new razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_SECRET
    });
    
    const razorpayOrder = await razorpayInstance.orders.create(options);
    
    console.log('✅ Razorpay order created:', razorpayOrder.id);
    
    // 4. Save transaction record
    // Create transaction with correct order reference
    const transaction = new Transaction({
      transactionId: razorpayOrder.id,
      order: order._id,  // Use the MongoDB ObjectId
      orderId: orderId,  // Keep string orderId for reference
      store: storeId,
      amount: amount,
      currency: currency,
      gateway: 'razorpay',
      status: 'created',
      customer: {
        userId: req.userId,
        name: order.customer?.name,
        email: order.customer?.email
      },
      paymentDetails: {
        razorpay_order_id: razorpayOrder.id,
        order_reference: orderId
      },
      metadata: {
        notes: `Payment for order ${orderId}`
      },
      isTest: process.env.NODE_ENV === 'development'
    });
    
    await transaction.save();
    
    console.log('✅ Transaction saved:', transaction._id);
    
    // 5. Return response to frontend
    res.json({
      success: true,
      order: razorpayOrder,
      key: process.env.RAZORPAY_KEY_ID,
      transactionId: razorpayOrder.id,
      orderData: {
        orderId: order.orderId,
        amount: order.total,
        items: order.items
      }
    });
    
  } catch (error) {
    console.error('❌ Razorpay create error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create payment order',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

app.post('/api/payments/razorpay/verify', verifyToken, async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    console.log('🔍 Verifying payment:', { razorpay_order_id, razorpay_payment_id });
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing payment verification data'
      });
    }
    
    // 1. Verify signature
    const crypto = require('crypto');
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(body)
      .digest('hex');
    
    const isSignatureValid = expectedSignature === razorpay_signature;
    
    if (!isSignatureValid) {
      return res.status(400).json({
        success: false,
        error: 'Payment verification failed: Invalid signature'
      });
    }
    
    // 2. Find transaction
    const transaction = await Transaction.findOne({ 
      transactionId: razorpay_order_id 
    });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    // 3. Update transaction
    transaction.status = 'completed';
    transaction.paymentDetails = {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    };
    transaction.updatedAt = new Date();
    
    await transaction.save();
    
    // 4. Update order using orderId from transaction
    const order = await Order.findOne({ orderId: transaction.orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // 5. CRITICAL: Assign inventory to order items
    console.log('🎯 Assigning inventory for order:', order.orderId);
    console.log('📦 Order items:', order.items.length);
    
    let inventoryAssigned = false;
    
    for (const item of order.items) {
      try {
        console.log(`🔄 Processing item: ${item.name} (${item.productId})`);
        
        const product = await Product.findById(item.productId);
        if (!product) {
          console.log(`❌ Product not found: ${item.productId}`);
          continue;
        }
        
        // Check if product has inventory system enabled
        if (product.inventory?.type !== 'none') {
          console.log(`✅ Product has inventory system: ${product.name}`);
          
          // Find available inventory item
          const availableItem = product.inventory.items.find(
            inv => inv.status === 'available'
          );
          
          if (availableItem) {
            console.log(`✅ Found available inventory: ${availableItem._id}`);
            
            // Mark inventory item as sold
            availableItem.status = 'sold';
            availableItem.orderId = order.orderId;
            availableItem.soldAt = new Date();
            availableItem.customerEmail = order.customer?.email;
            
            // Update inventory counts
            product.inventory.soldCount = (product.inventory.soldCount || 0) + 1;
            product.inventory.stockCount = product.inventory.items.filter(
              inv => inv.status === 'available'
            ).length;
            
            await product.save();
            console.log(`✅ Inventory marked as sold: ${product.name}`);
            
            // Update order item with inventory details
            item.inventoryAssigned = true;
            item.inventoryItemId = availableItem._id;
            item.deliveryDetails = {
              credentials: availableItem.details,
              deliveredAt: new Date(),
              deliveryMethod: 'instant'
            };
            
            inventoryAssigned = true;
            
            console.log(`✅ Order item updated with inventory: ${item.name}`);
          } else {
            console.log(`❌ No available inventory for: ${product.name}`);
          }
        } else {
          console.log(`ℹ️ Product has no inventory system: ${product.name}`);
        }
      } catch (itemError) {
        console.error(`Error processing item ${item.productId}:`, itemError);
      }
    }
    
    // Update order status
    order.paymentStatus = 'paid';
    order.status = 'completed';
    order.paymentDetails = {
      gateway: 'razorpay',
      transactionId: razorpay_payment_id,
      paymentDate: new Date()
    };
    order.inventoryReserved = inventoryAssigned;
    order.updatedAt = new Date();
    
    await order.save();
    console.log('✅ Order updated with inventory:', inventoryAssigned);
    
    // Debug: Log order after update
    console.log('📊 Final order state:', {
      orderId: order.orderId,
      inventoryAssigned: order.items.some(item => item.inventoryAssigned),
      items: order.items.map(item => ({
        name: item.name,
        inventoryAssigned: item.inventoryAssigned,
        inventoryItemId: item.inventoryItemId
      }))
    });
    
    // 6. Broadcast real-time dashboard update to store owner
    const store = await Store.findById(order.storeId || order.store);
    if (store && store.owner) {
      try {
        // Import and use dashboard updates
        const { broadcastDashboardUpdate } = require('./utils/dashboardUpdates');
        await broadcastDashboardUpdate(store.owner.toString(), store._id.toString());
        console.log('📊 Dashboard update broadcasted for store owner:', store.owner);
      } catch (broadcastError) {
        console.error('Error broadcasting dashboard update:', broadcastError);
      }
    }
    
  // Add this near the top of the verify function
const { sendDeliveryEmail } = require('./utils/emailService');

// Then inside the verify function, after saving order and before sending response:
if (inventoryAssigned) {
  // Prepare delivery details for email
  const emailDeliveryDetails = [];
  for (const item of order.items) {
    if (item.inventoryAssigned && item.deliveryDetails) {
      const product = await Product.findById(item.productId);
      if (product) {
        const credentials = {};
        const pairs = item.deliveryDetails.credentials.split('|');
        pairs.forEach(pair => {
          const [key, value] = pair.split(':').map(str => str.trim());
          if (key && value) credentials[key] = value;
        });
        
        emailDeliveryDetails.push({
          productId: product._id,
          productName: product.name,
          credentials
        });
      }
    }
  }
}

// Then send the response ONLY ONCE
res.json({
  success: true,
  message: 'Payment verified successfully',
  transactionId: razorpay_payment_id,
  orderId: transaction.orderId,
  inventoryAssigned,
  standaloneUrl: `http://localhost:3000/order/${transaction.orderId}/delivery`,
  data: {
    transaction: transaction._id,
    order: order._id
  }
});
    
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    res.status(500).json({
      success: false,
      error: 'Payment verification failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Product inventiry route -

app.get('/api/products/:productId/inventory', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    // Verify store ownership
    const store = await Store.findById(product.store);
    if (!store || store.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    res.json({
      success: true,
      data: {
        inventory: product.inventory,
        productName: product.name
      }
    });
    
  } catch (error) {
    console.error('Get inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory'
    });
  }
});

// Add inventory items
app.post('/api/products/:productId/inventory', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { items } = req.body; // Array of inventory items
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Inventory items are required'
      });
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    // Verify store ownership
    const store = await Store.findById(product.store);
    if (!store || store.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    // Add inventory items
    const inventoryItems = items.map(item => ({
      details: item.details,
      notes: item.notes || '',
      status: 'available'
    }));
    
    product.inventory.items.push(...inventoryItems);
    product.inventory.stockCount = product.inventory.items.filter(item => item.status === 'available').length;
    product.inventory.type = 'manual'; // Set to manual inventory
    
    await product.save();
    
    res.json({
      success: true,
      message: `${items.length} inventory items added`,
      data: {
        inventory: product.inventory
      }
    });
    
  } catch (error) {
    console.error('Add inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add inventory'
    });
  }
});

// Deliver inventory for an order
app.post('/api/orders/:orderId/deliver', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { productId } = req.body;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // Verify store ownership
    const store = await Store.findById(order.store);
    if (!store || store.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    // Find available inventory item
    const availableItem = product.inventory.items.find(item => item.status === 'available');
    if (!availableItem) {
      return res.status(400).json({
        success: false,
        error: 'No inventory available for this product'
      });
    }
    
    // Mark as sold
    availableItem.status = 'sold';
    availableItem.soldAt = new Date();
    availableItem.orderId = orderId;
    
    // Update counts
    product.inventory.soldCount += 1;
    product.inventory.stockCount = product.inventory.items.filter(item => item.status === 'available').length;
    
    await product.save();
    
    // Update order item to mark as delivered
    const orderItem = order.items.find(item => item.productId.toString() === productId);
    if (orderItem) {
      orderItem.inventoryDelivered = true;
      orderItem.deliveredAt = new Date();
      orderItem.deliveryDetails = availableItem.details;
    }
    
    await order.save();
    
    res.json({
      success: true,
      message: 'Inventory delivered successfully',
      data: {
        deliveryDetails: availableItem.details,
        orderId,
        productName: product.name
      }
    });
    
  } catch (error) {
    console.error('Deliver inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to deliver inventory'
    });
  }
});
// In server.js, add these routes:


// Import inventory service
const InventoryService = require('./services/inventoryService');

// Delivery routes
// Deliver inventory and get credentials
app.get('/api/orders/:orderId/deliver', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📦 Fetching delivery for order:', orderId);
    
    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // Check payment status
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed. Please complete payment first.'
      });
    }
    
    console.log('✅ Order found with payment status:', order.paymentStatus);
    
    // Check if any inventory is assigned
    const hasInventoryAssigned = order.items.some(item => item.inventoryAssigned);
    
    // Don't send email here - it's for fetching delivery, not creating it
    // Email should be sent during payment verification
    
    if (!hasInventoryAssigned) {
      // Try to assign inventory now
      console.log('🔄 No inventory assigned yet. Attempting to assign...');
      
      let inventoryAssigned = false;
      const deliveryDetails = [];
      
      for (const item of order.items) {
        try {
          console.log(`🔄 Processing item: ${item.name} (${item.productId})`);
          
          const product = await Product.findById(item.productId);
          if (!product) {
            console.log(`❌ Product not found: ${item.productId}`);
            continue;
          }
          
          // Check if product has inventory system enabled
          if (product.inventory?.type !== 'none' && product.inventory?.items?.length > 0) {
            console.log(`✅ Product has inventory: ${product.name}`);
            
            // Find available inventory item
            const availableItem = product.inventory.items.find(
              inv => inv.status === 'available'
            );
            
            if (availableItem) {
              console.log(`✅ Found available inventory: ${availableItem._id}`);
              
              // Mark inventory item as sold
              availableItem.status = 'sold';
              availableItem.orderId = order.orderId;
              availableItem.soldAt = new Date();
              availableItem.customerEmail = order.customer?.email;
              
              // Update inventory counts
              product.inventory.soldCount = (product.inventory.soldCount || 0) + 1;
              product.inventory.stockCount = product.inventory.items.filter(
                inv => inv.status === 'available'
              ).length;
              
              await product.save();
              
              // Update order item with inventory details
              item.inventoryAssigned = true;
              item.inventoryItemId = availableItem._id;
              item.deliveryDetails = {
                credentials: availableItem.details,
                deliveredAt: new Date(),
                deliveryMethod: 'instant'
              };
              
              inventoryAssigned = true;
              
              // Add to delivery details
              const credentials = {};
              const pairs = availableItem.details.split('|');
              pairs.forEach(pair => {
                const [key, value] = pair.split(':').map(str => str.trim());
                if (key && value) credentials[key] = value;
              });
              
              deliveryDetails.push({
                productId: product._id,
                productName: product.name,
                credentials,
                deliveredAt: availableItem.soldAt,
                inventoryItemId: availableItem._id
              });
              
              console.log(`✅ Inventory assigned for: ${product.name}`);
            } else {
              console.log(`❌ No available inventory for: ${product.name}`);
            }
          } else {
            console.log(`ℹ️ Product has no inventory system: ${product.name}`);
          }
        } catch (itemError) {
          console.error(`Error processing item ${item.productId}:`, itemError);
        }
      }
      
      if (inventoryAssigned) {
        // Save the updated order
        await order.save();
        
        // DO NOT send email here - it's just a fetch request
        // Email should only be sent during initial payment processing
        
        return res.json({
          success: true,
          orderId,
          deliveryDetails,
          inventoryAssigned: true,
          message: 'Inventory assigned and delivered successfully!',
          standaloneUrl: `http://localhost:3000/order/${orderId}/delivery`
        });
      } else {
        return res.json({
          success: false,
          error: 'No inventory available for this order',
          message: 'All inventory items are currently sold out. Please contact the store owner.'
        });
      }
    }
    
    // If inventory is already assigned, return the details
    console.log('✅ Inventory already assigned for this order');
    
    const deliveryDetails = [];
    
    for (const item of order.items) {
      if (item.inventoryAssigned && item.deliveryDetails) {
        try {
          const product = await Product.findById(item.productId);
          const inventoryItem = product?.inventory?.items?.id(item.inventoryItemId);
          
          if (inventoryItem && inventoryItem.status === 'sold') {
            const credentials = {};
            const pairs = inventoryItem.details.split('|');
            pairs.forEach(pair => {
              const [key, value] = pair.split(':').map(str => str.trim());
              if (key && value) credentials[key] = value;
            });
            
            deliveryDetails.push({
              productId: product._id,
              productName: product?.name || item.name,
              credentials,
              deliveredAt: inventoryItem.soldAt || item.deliveryDetails.deliveredAt,
              inventoryItemId: inventoryItem._id
            });
          } else if (item.deliveryDetails.credentials) {
            // Parse from order item directly
            const credentials = {};
            const pairs = item.deliveryDetails.credentials.split('|');
            pairs.forEach(pair => {
              const [key, value] = pair.split(':').map(str => str.trim());
              if (key && value) credentials[key] = value;
            });
            
            deliveryDetails.push({
              productId: item.productId,
              productName: item.name,
              credentials,
              deliveredAt: item.deliveryDetails.deliveredAt,
              inventoryItemId: item.inventoryItemId
            });
          }
        } catch (error) {
          console.error('Error parsing delivery details:', error);
        }
      }
    }
    
    if (deliveryDetails.length === 0) {
      return res.json({
        success: false,
        error: 'No delivery details found',
        message: 'Inventory is being processed. Please try again in a few minutes.'
      });
    }
    
    // Return delivery details WITHOUT sending email
    res.json({
      success: true,
      orderId,
      deliveryDetails,
      deliveredAt: new Date(),
      standaloneUrl: `http://localhost:3000/order/${orderId}/delivery`,
      message: 'Delivery details retrieved successfully!'
    });
    
  } catch (error) {
    console.error('❌ Delivery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delivery details',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Debug endpoint to check order and inventory status
app.get('/api/debug/order/:orderId/inventory', async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.json({ success: false, error: 'Order not found' });
    }
    
    const inventoryStatus = [];
    
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        inventoryStatus.push({
          productName: product.name,
          productId: product._id,
          inventoryType: product.inventory?.type,
          totalItems: product.inventory?.items?.length || 0,
          available: product.inventory?.items?.filter(i => i.status === 'available').length || 0,
          reserved: product.inventory?.items?.filter(i => i.status === 'reserved').length || 0,
          sold: product.inventory?.items?.filter(i => i.status === 'sold').length || 0,
          
          // Order item status
          orderItemAssigned: item.inventoryAssigned,
          orderItemId: item.inventoryItemId,
          hasDeliveryDetails: !!item.deliveryDetails,
          
          // Find specific sold item for this order
          soldForThisOrder: product.inventory?.items?.find(i => i.orderId === orderId)
        });
      }
    }
    
    res.json({
      success: true,
      orderId,
      order: {
        paymentStatus: order.paymentStatus,
        status: order.status,
        itemsCount: order.items.length,
        inventoryAssignedItems: order.items.filter(i => i.inventoryAssigned).length
      },
      inventoryStatus
    });
    
  } catch (error) {
    console.error('Debug inventory error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Inventory management routes for store owners
app.get('/api/stores/:storeId/inventory', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: req.userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    // Get products with inventory
    const products = await Product.find({
      store: storeId,
      'inventory.type': { $ne: 'none' }
    }).select('name inventory price');
    
    const inventorySummary = products.map(product => ({
      productId: product._id,
      productName: product.name,
      price: product.price,
      inventoryType: product.inventory.type,
      totalItems: product.inventory.items.length,
      available: product.inventory.items.filter(i => i.status === 'available').length,
      sold: product.inventory.items.filter(i => i.status === 'sold').length,
      reserved: product.inventory.items.filter(i => i.status === 'reserved').length
    }));
    
    res.json({
      success: true,
      storeId,
      totalProducts: products.length,
      inventory: inventorySummary
    });
    
  } catch (error) {
    console.error('Get store inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get inventory'
    });
  }
});

// Add inventory items
app.post('/api/products/:productId/inventory', verifyToken, async (req, res) => {
  try {
    const { productId } = req.params;
    const { items } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Items array is required'
      });
    }
    
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }
    
    // Verify store ownership
    const store = await Store.findById(product.store);
    if (!store || store.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Unauthorized'
      });
    }
    
    const result = await InventoryService.addInventoryItems(productId, items);
    
    res.json({
      success: true,
      message: `${result.addedCount} inventory items added`,
      data: result
    });
    
  } catch (error) {
    console.error('Add inventory error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add inventory'
    });
  }
});

// Update payment routes to include inventory middleware
app.post('/api/payments/razorpay/create', 
  verifyToken, 
  paymentController.checkInventoryBeforePayment,
  paymentController.reserveInventoryOnPaymentInit,
  paymentController.createRazorpayOrder
);

app.get('/api/orders/:orderId/delivery-details', verifyToken, paymentController.getDeliveryDetails);
// ==================== PAYMENT ROUTES ====================

// Test Razorpay connection
app.get('/api/payments/test', (req, res) => {
  try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_SECRET;
    
    res.json({
      success: true,
      config: {
        key_id: key_id ? '✅ Configured' : '❌ Missing',
        key_secret: key_secret ? '✅ Configured' : '❌ Missing',
        node_env: process.env.NODE_ENV
      },
      message: 'Razorpay configuration check'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Razorpay payment routes
app.post('/api/payments/razorpay/create', verifyToken, paymentController.createRazorpayOrder);
app.post('/api/payments/razorpay/verify', verifyToken, paymentController.verifyPayment);
app.get('/api/payments/status/:orderId', verifyToken, paymentController.getPaymentStatus);
app.post('/api/payments/upi/create', verifyToken, paymentController.createUPIPayment);
app.post('/api/payments/crypto/create', verifyToken, paymentController.createCryptoPayment);

// Razorpay webhook (doesn't need auth token)
app.post('/api/payments/webhook/razorpay', paymentController.razorpayWebhook);
// Get payment status
app.get('/api/payments/status/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const transaction = await Transaction.findOne({ orderId });
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        error: 'Transaction not found'
      });
    }
    
    res.json({
      success: true,
      status: transaction.status,
      transaction: {
        id: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway,
        createdAt: transaction.createdAt
      }
    });
    
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get payment status'
    });
  }
});
// Test if payment endpoints exist
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  res.json({
    success: true,
    routes: routes.filter(route => route.path.includes('/payments/') || route.path.includes('/orders/'))
  });
});

// Debug Razorpay configuration
app.get('/api/debug/razorpay', (req, res) => {
  try {
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_SECRET;
    const node_env = process.env.NODE_ENV;
    
    console.log('🔑 Razorpay Debug:', { key_id, key_secret, node_env });
    
    // Try to initialize Razorpay
    let razorpayStatus = 'NOT_TESTED';
    try {
      const Razorpay = require('razorpay');
      const razorpay = new Razorpay({
        key_id: key_id,
        key_secret: key_secret
      });
      razorpayStatus = 'INITIALIZED_SUCCESSFULLY';
    } catch (razorpayError) {
      razorpayStatus = `INIT_FAILED: ${razorpayError.message}`;
    }
    
    res.json({
      success: true,
      razorpay: {
        key_id: key_id ? '✅ PRESENT' : '❌ MISSING',
        key_secret: key_secret ? '✅ PRESENT' : '❌ MISSING',
        node_env: node_env,
        status: razorpayStatus
      },
      paymentController: {
        exists: require('fs').existsSync('./controllers/paymentController.js')
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});
// Order routes
app.get('/api/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // Check if user has access to this order
    if (req.userRole !== 'admin') {
      if (order.userId && order.userId.toString() !== req.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }
    
    res.json({
      success: true,
      data: order
    });
    
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order'
    });
  }
});

// Get user orders
app.get('/api/user/orders', verifyToken, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders'
    });
  }
});

// Get store orders
app.get('/api/stores/:storeId/orders', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    
    // Verify user owns the store
    const store = await Store.findById(storeId);
    if (!store || store.owner.toString() !== req.userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }
    
    const orders = await Order.find({ storeId }).sort({ createdAt: -1 });
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (error) {
    console.error('Get store orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch store orders'
    });
  }
});

// ==================== AUTH ROUTES ====================
// Auth routes are handled by routes/auth.js

// Add these routes before the login route

// Check if models are loaded
app.get('/api/debug/models', (req, res) => {
  res.json({
    success: true,
    models: {
      User: User ? 'LOADED' : 'NOT LOADED',
      Store: Store ? 'LOADED' : 'NOT LOADED',
      Product: Product ? 'LOADED' : 'NOT LOADED',
      Order: Order ? 'LOADED' : 'NOT LOADED'
    },
    mongoose: {
      connected: mongoose.connection.readyState === 1,
      state: mongoose.connection.readyState,
      dbName: mongoose.connection.name
    }
  });
});

// List all users in database
app.get('/api/debug/users-list', async (req, res) => {
  try {
    const users = await User.find({});
    
    res.json({
      success: true,
      count: users.length,
      users: users.map(user => ({
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasStore: user.hasStore,
        storeId: user.storeId,
        createdAt: user.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Create a test user
app.post('/api/debug/create-test-user', async (req, res) => {
  try {
    const testEmail = 'test@example.com';
    
    // Check if user already exists
    const existingUser = await User.findOne({ email: testEmail });
    if (existingUser) {
      return res.json({
        success: true,
        message: 'Test user already exists',
        user: {
          email: existingUser.email,
          name: existingUser.name,
          id: existingUser._id
        }
      });
    }
    
    // Create test user with plain password "test123"
    const hashedPassword = await bcrypt.hash('test123', 10);
    const user = await User.create({
      name: 'Test User',
      email: testEmail,
      password: hashedPassword,
      role: 'user',
      hasStore: false
    });
    
    res.json({
      success: true,
      message: 'Test user created',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        testPassword: 'test123' // Show the test password
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});



// ==================== STORE ROUTES ====================

// Get user's stores
// Get user's stores - FIX THIS:
// Get user domains
app.get('/api/user/domains', verifyToken, async (req, res) => {
  try {
    const DomainOrder = require('./models/DomainOrder');
    const domains = await DomainOrder.find({ 
      userId: req.userId,
      status: { $in: ['pending', 'completed'] }
    })
    .populate('storeId', 'storeName')
    .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: domains.map(order => ({
        name: order.domain,
        status: order.status,
        expires: order.expiresAt,
        setupComplete: order.setupComplete,
        purchasedAt: order.createdAt
      }))
    });
  } catch (error) {
    console.error('❌ Error fetching user domains:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch domains'
    });
  }
});

app.get('/api/user/stores', verifyToken, async (req, res) => {
  try {
    console.log('🔍 Fetching stores for user:', req.userId);
    
    // ✅ FIXED: Use 'owner' field instead of 'ownerId'
    const stores = await Store.find({ owner: req.userId });
    
    console.log('📊 Found stores:', stores.length);
    stores.forEach(store => {
      console.log(`- ${store.storeName} (${store._id}) - owner: ${store.owner}`);
    });
    
    res.json({
      success: true,
      data: stores
    });
  } catch (error) {
    console.error('Error fetching user stores:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Debug store data
app.get('/api/debug/stores/:slug', async (req, res) => {
  try {
    const store = await Store.findOne({ storeSlug: req.params.slug });
    
    if (!store) {
      return res.json({
        success: false,
        message: 'Store not found'
      });
    }
    
    // Check products in this store
    const products = await Product.find({ storeId: store._id });
    
    res.json({
      success: true,
      store: {
        id: store._id,
        name: store.storeName,
        slug: store.storeSlug,
        owner: store.owner,
        template: store.template,
        status: store.status
      },
      products: {
        count: products.length,
        items: products.map(p => ({
          id: p._id,
          name: p.name,
          price: p.price,
          status: p.status
        }))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/stores/create', verifyToken, upload.fields([
  { name: 'logo', maxCount: 1 },
  { name: 'banner', maxCount: 1 }
]), async (req, res) => {
  try {
    const userId = req.userId;
    const storeData = req.body;
    
    console.log('📝 Store creation request received:', {
      userId,
      storeName: storeData.storeName,
      template: storeData.template, // Log template
      storeType: storeData.storeType
    });

    // Debug: Log all received fields
    console.log('📋 All body fields:', Object.keys(storeData));
    Object.keys(storeData).forEach(key => {
      console.log(`${key}:`, storeData[key]);
    });

    // Generate store slug
    const storeSlug = generateStoreSlug(storeData.storeName);

    // Check if slug already exists
    const existingStore = await Store.findOne({ storeSlug });
    if (existingStore) {
      console.log('❌ Store slug already exists:', storeSlug);
      return res.status(400).json({
        success: false,
        error: 'Store URL already taken. Please choose a different name.'
      });
    }

    // Handle file uploads
    const branding = {};
    if (req.files?.logo) {
      branding.logo = `/uploads/${req.files.logo[0].filename}`;
    }
    if (req.files?.banner) {
      branding.banner = `/uploads/${req.files.banner[0].filename}`;
    }

    // Get template from body - it should be sent as a simple string
    const template = storeData.template || 'modern';
    
    console.log('✅ Template received:', template);

    // Parse JSON fields
    let theme = {};
    let paymentMethods = {};
    let features = {};
    
    try {
      theme = storeData.theme ? JSON.parse(storeData.theme) : {};
      paymentMethods = storeData.paymentMethods ? JSON.parse(storeData.paymentMethods) : {};
      features = storeData.features ? JSON.parse(storeData.features) : {};
    } catch (parseError) {
      console.error('Error parsing JSON fields:', parseError);
    }

    // Extract crypto wallet from paymentMethods
    let cryptoWallet = '';
    let cryptoPaymentEnabled = false;
    let preferredCryptoCurrency = 'btc';
    
    if (paymentMethods.crypto && paymentMethods.crypto.wallets) {
      // Get the first available wallet address
      const wallets = paymentMethods.crypto.wallets;
      const selectedCryptos = paymentMethods.crypto.selected || [];
      
      // Use the first selected crypto's wallet, or the first available wallet
      if (selectedCryptos.length > 0 && wallets[selectedCryptos[0]]) {
        cryptoWallet = wallets[selectedCryptos[0]];
        preferredCryptoCurrency = selectedCryptos[0];
        cryptoPaymentEnabled = true;
      } else {
        // Fallback: get first available wallet
        const firstCrypto = Object.keys(wallets).find(key => wallets[key] && wallets[key].trim() !== '');
        if (firstCrypto) {
          cryptoWallet = wallets[firstCrypto];
          preferredCryptoCurrency = firstCrypto;
          cryptoPaymentEnabled = true;
        }
      }
    }

    console.log('🛠️ Creating store with data:', {
      ownerId: userId,
      storeName: storeData.storeName,
      storeSlug,
      template: template,
      branding,
      cryptoPaymentEnabled,
      cryptoWallet: cryptoWallet ? 'configured' : 'not configured'
    });

    // Create store
const store = await Store.create({
  owner: userId,  // Change to 'owner' for consistency
  storeName: storeData.storeName,
  storeSlug,
  template: storeData.template || 'modern', // Make sure template is included
  description: storeData.description,
  contactEmail: storeData.contactEmail,
  storeType: storeData.storeType || 'digital',
  theme,
  features,
  paymentMethods,
  branding,
  cryptoWallet,
  cryptoPaymentEnabled,
  preferredCryptoCurrency,
  status: 'active',
  isPublished: true
});

    console.log('✅ Store created:', store._id, 'Template:', store.template);

    // Update user role and store info
    await User.findByIdAndUpdate(userId, {
      role: 'store_owner',
      hasStore: true,
      storeId: store._id,
      storeSlug: store.storeSlug
    });

    console.log('✅ User updated with store info');

    res.status(201).json({
      success: true,
      message: 'Store created successfully!',
      data: { 
       store, // This contains the 'storeSlug'
    storeUrl: `http://localhost:3000/store/${store.storeSlug}`
      }
    });

  } catch (error) {
    console.error('❌ Error creating store:', error);
    
    // Clean up uploaded files if error occurred
    if (req.files) {
      Object.values(req.files).forEach(files => {
        files.forEach(file => {
          fs.unlink(file.path, (err) => {
            if (err) console.error('Error deleting file:', err);
          });
        });
      });
    }
    
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get store by slug (public) - REMOVED: This route is handled by routes/stores.js
// The route in routes/stores.js uses the proper controller with correct field checks

// Store dashboard
app.get('/api/stores/:slug/dashboard', verifyToken, async (req, res) => {
  try {
    const store = await Store.findOne({ 
      storeSlug: req.params.slug,
      owner: req.userId  // ✅ Changed from 'ownerId' to 'owner'
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }

    // Get store stats
    const productsCount = await Product.countDocuments({ storeId: store._id });
    const ordersCount = await Order.countDocuments({ storeId: store._id });
    const revenueAgg = await Order.aggregate([
      { 
        $match: { 
          storeId: store._id, 
          status: { $in: ['completed', 'delivered'] },
          'payment.status': 'completed'
        } 
      },
      { 
        $group: { 
          _id: null, 
          total: { $sum: '$total' } 
        } 
      }
    ]);

    res.json({
      success: true,
      data: {
        store,
        stats: {
          products: productsCount,
          orders: ordersCount,
          revenue: revenueAgg[0]?.total || 0,
          visitors: store.visitors || 0
        }
      }
    });

  } catch (error) {
    console.error('Error fetching store dashboard:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Direct route for store products by slug - REMOVED: This route is handled by routes/stores.js
// The route in routes/stores.js uses the proper controller with correct field checks and response format
app.get('/api/debug/all-stores', async (req, res) => {
  try {
    const stores = await Store.find({});
    
    res.json({
      success: true,
      count: stores.length,
      stores: stores.map(store => ({
        id: store._id,
        name: store.storeName,
        slug: store.storeSlug,
        owner: store.owner,
        template: store.template,
        status: store.status,
        createdAt: store.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});


// Add to server.js to debug routes
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router') {
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          routes.push({
            path: handler.route.path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  res.json({
    success: true,
    routes: routes.filter(route => route.path.includes('/stores/'))
  });
});
// Create product for store - UPDATED VERSION
app.post('/api/stores/:slug/products', verifyToken, upload.array('images', 10), async (req, res) => {
  try {
    console.log('📦 Product creation for store:', req.params.slug);
    console.log('📝 Raw body:', req.body);
    
    // Find store by slug
    const store = await Store.findOne({ storeSlug: req.params.slug });
    if (!store) {
      console.log('❌ Store not found:', req.params.slug);
      return res.status(404).json({ 
        success: false, 
        error: 'Store not found' 
      });
    }
    
    console.log('✅ Store found:', {
      id: store._id,
      name: store.storeName,
      slug: store.storeSlug,
      owner: store.owner,
      template: store.template
    });
    
    // Check if user owns this store
    console.log('👤 User check - Store owner:', store.owner, 'Request user:', req.userId);
    
    // Fix: Compare as strings
    if (String(store.owner) !== String(req.userId)) {
      console.log('❌ Permission denied - user does not own this store');
      return res.status(403).json({ 
        success: false, 
        error: 'You do not have permission to add products to this store' 
      });
    }
    
    console.log('✅ Permission granted');
    
    // Generate slug
    const slug = req.body.name.toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 50) + '-' + Math.random().toString(36).substr(2, 6);
    
    // Prepare product data
    const productData = {
      name: req.body.name,
      description: req.body.description || '',
      shortDescription: req.body.shortDescription || req.body.description?.substring(0, 100) || '',
      price: parseFloat(req.body.price) || 0,
      comparePrice: req.body.comparePrice ? parseFloat(req.body.comparePrice) : null,
      type: req.body.type || 'digital',
      isActive: req.body.status === 'active' || req.body.isActive !== false, // Use isActive instead of status
      visibility: req.body.visibility || 'public',
      stock: parseInt(req.body.stock) || 0,
      lowStockThreshold: parseInt(req.body.lowStockThreshold) || 10,
      
      // ✅ CRITICAL: Use correct field names
      category: req.body.category || req.body.categories?.[0] || 'General',
      slug: slug,
      store: store._id,  // Main reference (ObjectId)
      storeId: store._id.toString(), // For compatibility (String)
      owner: req.userId,
      
      // Optional fields
      categories: req.body.categories ? 
        (Array.isArray(req.body.categories) ? req.body.categories : JSON.parse(req.body.categories)) 
        : ['General'],
      tags: req.body.tags ? 
        (Array.isArray(req.body.tags) ? req.body.tags : JSON.parse(req.body.tags)) 
        : [],
      sku: req.body.sku || '',
      barcode: req.body.barcode || '',

        inventory: {
        type: req.body.inventoryType || 'none',
        items: [],
        stockCount: 0,
        soldCount: 0,
        lowStockThreshold: 10
      }
    }
    
       if (req.body.inventoryType === 'manual' && req.body.inventoryItems) {
      const inventoryItems = req.body.inventoryItems
        .split('\n')
        .filter(line => line.trim())
        .map(details => ({
          details: details.trim(),
          status: 'available',
          createdAt: new Date()
        }));
      
      productData.inventory.items = inventoryItems;
      productData.inventory.stockCount = inventoryItems.length;
    }
    console.log('📝 Product data prepared:', {
      name: productData.name,
      price: productData.price,
      category: productData.category,
      slug: productData.slug,
      store: productData.store,
      storeId: productData.storeId
    });
    
    // Handle images with GridFS
    if (req.files && req.files.length > 0) {
      productData.images = req.files.map(file => ({
        filename: file.filename,
        bucketName: 'uploads',
        contentType: file.mimetype,
        uploadDate: new Date()
      }));
      console.log('📸 Images added to GridFS:', productData.images.length);
    } else {
      // Default image reference
      productData.images = [{
        filename: 'default-product.jpg',
        bucketName: 'uploads',
        contentType: 'image/jpeg',
        uploadDate: new Date()
      }];
    }
    
    // Create product


    
    console.log('✅ Product created successfully:', {
      id: product._id,
      name: product.name,
      store: product.store,
      storeId: product.storeId
    });
    
    res.status(201).json({
      success: true,
      message: 'Product created successfully!',
      data: product
    });
    const product = await Product.create(productData);
  } catch (error) {
    console.error('❌ Product creation error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});
// Simple test endpoint
app.post('/api/test-upload', upload.array('images', 10), (req, res) => {
  console.log('✅ Test upload endpoint hit');
  console.log('📝 Body:', req.body);
  console.log('📁 Files:', req.files);
  res.json({
    success: true,
    message: 'Upload test successful',
    body: req.body,
    files: req.files
  });
});

// ==================== DASHBOARD ROUTES ====================

// Store real-time event emitters (for SSE)
const dashboardClients = new Map(); // userId -> Set of response objects

// Note: dashboardUpdates will be initialized after calculateDashboardStats is defined

// Helper function to calculate dashboard stats
const calculateDashboardStats = async (userId, storeId = null, range = 'all') => {
  try {
    // Calculate date range
    const now = new Date();
    let startDate = new Date(0); // Default: all time
    
    if (range !== 'all') {
      switch(range) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case '1y':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
      }
    }
    
    // Get user's stores
    const storeQuery = { owner: userId };
    if (storeId) {
      // Handle both string and ObjectId
      storeQuery._id = mongoose.Types.ObjectId.isValid(storeId) ? new mongoose.Types.ObjectId(storeId) : storeId;
    }
    const stores = await Store.find(storeQuery);
    const storeIds = stores.map(store => store._id);
    
    if (storeIds.length === 0) {
      return {
        revenue: 0,
        netProfit: 0,
        newOrders: 0,
        newCustomers: 0,
        conversionRate: 0,
        avgOrderValue: 0,
        totalProducts: 0,
      };
    }
    
    // Get all completed orders (paid orders)
    // Match by both storeId (string) and store (ObjectId) for compatibility
    const completedOrders = await Order.find({
      $or: [
        { storeId: { $in: storeIds.map(id => id.toString()) } },
        { store: { $in: storeIds } }
      ],
      createdAt: { $gte: startDate },
      status: 'completed',
      paymentStatus: 'paid'
    });
    
    // Calculate revenue from completed orders
    const revenue = completedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    
    // Count orders
    const newOrders = completedOrders.length;
    
    // Count unique customers (by email)
    const uniqueCustomers = new Set();
    completedOrders.forEach(order => {
      if (order.customer?.email) {
        uniqueCustomers.add(order.customer.email);
      }
    });
    const newCustomers = uniqueCustomers.size;
    
    // Calculate average order value
    const avgOrderValue = newOrders > 0 ? revenue / newOrders : 0;
    
    // Get total products
    const totalProducts = await Product.countDocuments({ 
      store: { $in: storeIds },
      isActive: true
    });
    
    // Count refunds
    const refunds = await Order.countDocuments({
      $or: [
        { storeId: { $in: storeIds.map(id => id.toString()) } },
        { store: { $in: storeIds } }
      ],
      createdAt: { $gte: startDate },
      status: 'refunded'
    });
    
    // Net profit (assuming 100% profit for now, can be adjusted based on product costs)
    const netProfit = revenue; 

    const conversionRate = 0; 
    return {
      revenue: Math.round(revenue * 100) / 100, // Round to 2 decimals
      netProfit: Math.round(netProfit * 100) / 100,
      newOrders,
      newCustomers,
      conversionRate,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalProducts,
      refunds
    };
  } catch (error) {
    console.error('Error calculating dashboard stats:', error);
    return {
      revenue: 0,
      netProfit: 0,
      newOrders: 0,
      newCustomers: 0,
      conversionRate: 0,
      avgOrderValue: 0,
      totalProducts: 0,
      refunds: 0
    };
  }
};

// Broadcast dashboard update to all connected clients for a user
const broadcastDashboardUpdate = async (userId, storeId = null) => {
  const clients = dashboardClients.get(userId);
  if (!clients || clients.size === 0) return;
  
  const stats = await calculateDashboardStats(userId, storeId);
  
  const message = JSON.stringify({
    type: 'dashboard_update',
    data: stats,
    timestamp: new Date().toISOString()
  });
  
  clients.forEach(res => {
    try {
      res.write(`data: ${message}\n\n`);
    } catch (error) {
      console.error('Error sending SSE message:', error);
      clients.delete(res);
    }
  });
};

// Listen for dashboard update events from other modules
const dashboardUpdates = require('./utils/dashboardUpdates');
dashboardUpdates.getEmitter().on('dashboard-update', async ({ userId, storeId }) => {
  await broadcastDashboardUpdate(userId, storeId);
});

// Dashboard stats endpoint
app.get('/api/dashboard/stats', verifyToken, async (req, res) => {
  try {
    const { range = 'all', storeId = null } = req.query;
    const userId = req.userId;
    
    const stats = await calculateDashboardStats(userId, storeId, range);
    
    res.json({
      success: true,
      data: stats
    });
    
  } catch (error) {
    console.error('❌ Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard statistics'
    });
  }
});

// Enhanced Order Analytics Endpoint
app.get('/api/dashboard/order-analytics', verifyToken, async (req, res) => {
  try {
    const { storeId, range = '30d', includePredictions = false } = req.query;
    const userId = req.userId;
    
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch(range) {
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      default:
        startDate.setDate(now.getDate() - 30);
    }
    
    // Get orders for the period
    const orders = await Order.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ],
      createdAt: { $gte: startDate }
    }).sort({ createdAt: 1 });
    
    // Group by day
    const ordersByDay = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!ordersByDay[date]) {
        ordersByDay[date] = {
          date: date,
          orders: 0,
          revenue: 0,
          customers: new Set(),
          refunds: 0,
          items: 0
        };
      }
      ordersByDay[date].orders += 1;
      ordersByDay[date].revenue += (order.total || 0);
      ordersByDay[date].items += (order.items?.length || 0);
      if (order.customer?.email) {
        ordersByDay[date].customers.add(order.customer.email);
      }
      if (order.status === 'refunded') {
        ordersByDay[date].refunds += 1;
      }
    });
    
    // Format timeline data
    const timeline = Object.values(ordersByDay)
      .map(day => ({
        date: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: day.revenue,
        orders: day.orders,
        customers: day.customers.size,
        avgOrderValue: day.orders > 0 ? day.revenue / day.orders : 0,
        itemsPerOrder: day.orders > 0 ? day.items / day.orders : 0,
        refunds: day.refunds
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // Calculate summary stats
    const totalRevenue = timeline.reduce((sum, day) => sum + day.revenue, 0);
    const totalOrders = timeline.reduce((sum, day) => sum + day.orders, 0);
    const totalCustomers = new Set();
    orders.forEach(order => {
      if (order.customer?.email) {
        totalCustomers.add(order.customer.email);
      }
    });
    
    // Find peak hour (simplified)
    const hourCounts = {};
    orders.forEach(order => {
      const hour = new Date(order.createdAt).getHours();
      hourCounts[hour] = (hourCounts[hour] || 0) + 1;
    });
    const peakHour = Object.entries(hourCounts).reduce((a, b) => a[1] > b[1] ? a : b, [12, 0]);
    
    // Get top products
    const productSales = {};
    orders.forEach(order => {
      order.items?.forEach(item => {
        if (!productSales[item.productId]) {
          productSales[item.productId] = {
            name: item.name,
            orders: 0,
            revenue: 0,
            quantity: 0
          };
        }
        productSales[item.productId].orders += 1;
        productSales[item.productId].revenue += (item.price || 0) * (item.quantity || 1);
        productSales[item.productId].quantity += (item.quantity || 1);
      });
    });
    
    const topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)
      .map(product => ({
        ...product,
        growth: '+' + (Math.random() * 30 + 5).toFixed(0) + '%'
      }));
    
    // Get top customers
    const customerData = {};
    orders.forEach(order => {
      if (order.customer?.email) {
        const email = order.customer.email;
        if (!customerData[email]) {
          customerData[email] = {
            name: order.customer.name || 'Anonymous',
            orders: 0,
            total: 0,
            lastOrder: order.createdAt
          };
        }
        customerData[email].orders += 1;
        customerData[email].total += (order.total || 0);
        if (order.createdAt > customerData[email].lastOrder) {
          customerData[email].lastOrder = order.createdAt;
        }
      }
    });
    
    const topCustomers = Object.values(customerData)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)
      .map(customer => ({
        ...customer,
        lastOrder: formatRelativeTime(customer.lastOrder)
      }));
    
    // Geographic data (mock for now)
    const geodata = [
      { country: 'United States', orders: Math.floor(totalOrders * 0.4), revenue: totalRevenue * 0.4 },
      { country: 'United Kingdom', orders: Math.floor(totalOrders * 0.15), revenue: totalRevenue * 0.15 },
      { country: 'Canada', orders: Math.floor(totalOrders * 0.12), revenue: totalRevenue * 0.12 },
      { country: 'Australia', orders: Math.floor(totalOrders * 0.08), revenue: totalRevenue * 0.08 },
      { country: 'Germany', orders: Math.floor(totalOrders * 0.06), revenue: totalRevenue * 0.06 }
    ];
    
    // Predictions (mock AI predictions)
    let predictions = [];
    if (includePredictions && timeline.length >= 7) {
      const last7Days = timeline.slice(-7);
      const avgRevenue = last7Days.reduce((sum, day) => sum + day.revenue, 0) / 7;
      const avgOrders = last7Days.reduce((sum, day) => sum + day.orders, 0) / 7;
      
      predictions = Array.from({ length: 7 }, (_, i) => {
        const futureDate = new Date(now);
        futureDate.setDate(futureDate.getDate() + i + 1);
        return {
          date: futureDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          predictedRevenue: avgRevenue * (1 + (Math.random() * 0.2 - 0.1)), // ±10% variation
          predictedOrders: Math.round(avgOrders * (1 + (Math.random() * 0.15 - 0.075))),
          confidence: 70 + Math.random() * 25 // 70-95% confidence
        };
      });
    }
    
    res.json({
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          totalCustomers: totalCustomers.size,
          avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
          refundRate: totalOrders > 0 ? (timeline.reduce((sum, day) => sum + day.refunds, 0) / totalOrders * 100).toFixed(1) : 0,
          conversionRate: 12.5, // This would come from traffic data
          peakHour: `${peakHour[0]}:00 - ${parseInt(peakHour[0]) + 2}:00`,
          mostPopularDay: 'Friday' // Would calculate from data
        },
        timeline,
        geodata,
        products: topProducts,
        customers: topCustomers,
        predictions
      }
    });
    
  } catch (error) {
    console.error('Order analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order analytics'
    });
  }
});

// Helper function
function formatRelativeTime(date) {
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return `${Math.floor(diffDays / 30)} months ago`;
}

// Add these routes to your server.js file

// Get analytics data
app.get('/api/dashboard/analytics', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.query;
    const userId = req.userId;
    
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Get all orders for this store
    const orders = await Order.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ]
    });
    
    // Calculate status analysis
    const statusAnalysis = {};
    orders.forEach(order => {
      const status = order.status || 'pending';
      statusAnalysis[status] = (statusAnalysis[status] || 0) + 1;
    });
    
    // Calculate payment analysis
    const paymentAnalysis = {};
    orders.forEach(order => {
      const method = order.payment?.method || 'unknown';
      paymentAnalysis[method] = (paymentAnalysis[method] || 0) + 1;
    });
    
    // Calculate customer analysis
    const customers = {};
    orders.forEach(order => {
      const email = order.customer?.email;
      if (email) {
        if (!customers[email]) {
          customers[email] = {
            name: order.customer?.name,
            totalOrders: 0,
            totalSpent: 0
          };
        }
        customers[email].totalOrders += 1;
        customers[email].totalSpent += (order.total || 0);
      }
    });
    
    const customerEmails = Object.keys(customers);
    const repeatCustomers = customerEmails.filter(email => customers[email].totalOrders > 1);
    const repeatRate = customerEmails.length > 0 ? (repeatCustomers.length / customerEmails.length) * 100 : 0;
    
    // Get products for category analysis
    const products = await Product.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ]
    });
    
    // Calculate category analysis
    const categoryAnalysis = {};
    products.forEach(product => {
      const category = product.category || 'Uncategorized';
      categoryAnalysis[category] = (categoryAnalysis[category] || 0) + 1;
    });
    
    // Get top products by sales
    const topProducts = products
      .filter(p => p.salesCount > 0)
      .sort((a, b) => (b.salesCount || 0) - (a.salesCount || 0))
      .slice(0, 5)
      .map(p => ({
        name: p.name,
        sales: p.salesCount || 0
      }));
    
    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        statusAnalysis,
        paymentAnalysis,
        customerAnalysis: {
          totalCustomers: customerEmails.length,
          repeatCustomers: repeatCustomers.length,
          repeatRate: parseFloat(repeatRate.toFixed(1)),
          growth: 12.5 // Placeholder - you can calculate this based on time period
        },
        categoryAnalysis,
        topProducts
      }
    });
    
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics data'
    });
  }
});

// Get revenue trend data
app.get('/api/dashboard/revenue-trend', verifyToken, async (req, res) => {
  try {
    const { storeId, range = '7d' } = req.query;
    const userId = req.userId;
    
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch(range) {
      case '24h':
        startDate.setDate(now.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(now.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(now.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(now.getDate() - 90);
        break;
      default:
        startDate.setDate(now.getDate() - 7);
    }
    
    // Get orders for the date range
    const orders = await Order.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ],
      createdAt: { $gte: startDate },
      status: { $in: ['completed', 'delivered'] },
      paymentStatus: 'paid'
    }).sort({ createdAt: 1 });
    
    // Group by day
    const revenueByDay = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!revenueByDay[date]) {
        revenueByDay[date] = {
          revenue: 0,
          orders: 0
        };
      }
      revenueByDay[date].revenue += (order.total || 0);
      revenueByDay[date].orders += 1;
    });
    
    // Format for chart
    const revenueData = Object.entries(revenueByDay).map(([date, data]) => {
      const dayDate = new Date(date);
      let label;
      
      if (range === '7d') {
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        label = days[dayDate.getDay()];
      } else if (range === '30d' || range === '90d') {
        label = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      } else {
        label = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      }
      
      return {
        label,
        revenue: data.revenue,
        orders: data.orders,
        date: date
      };
    });
    
    // Sort by date
    revenueData.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    // If no data, provide sample data
    if (revenueData.length === 0) {
      const sampleData = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dayLabel = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()];
        sampleData.push({
          label: dayLabel,
          revenue: Math.random() * 5000 + 3000,
          orders: Math.floor(Math.random() * 20) + 10,
          date: date.toISOString().split('T')[0]
        });
      }
      return res.json({
        success: true,
        data: sampleData
      });
    }
    
    res.json({
      success: true,
      data: revenueData
    });
    
  } catch (error) {
    console.error('Revenue trend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue trend data'
    });
  }
});

// Get store customers
app.get('/api/stores/:storeId/customers', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId = req.userId;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Get all orders for this store
    const orders = await Order.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ]
    });
    
    // Group orders by customer
    const customersMap = {};
    orders.forEach(order => {
      const email = order.customer?.email;
      if (email) {
        if (!customersMap[email]) {
          customersMap[email] = {
            email: email,
            name: order.customer?.name,
            totalOrders: 0,
            totalSpent: 0,
            orders: [],
            lastOrder: order.createdAt
          };
        }
        customersMap[email].totalOrders += 1;
        customersMap[email].totalSpent += (order.total || 0);
        customersMap[email].orders.push(order);
        if (order.createdAt > customersMap[email].lastOrder) {
          customersMap[email].lastOrder = order.createdAt;
        }
      }
    });
    
    // Convert to array and calculate additional metrics
    const customers = Object.values(customersMap).map(customer => {
      const avgOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
      
      // Determine loyalty level
      let loyaltyLevel = 'New';
      if (customer.totalOrders >= 10) {
        loyaltyLevel = 'VIP';
      } else if (customer.totalOrders >= 3) {
        loyaltyLevel = 'Regular';
      }
      
      return {
        ...customer,
        avgOrderValue,
        loyaltyLevel
      };
    });
    
    // Sort by total spent
    customers.sort((a, b) => b.totalSpent - a.totalSpent);
    
    res.json({
      success: true,
      data: customers
    });
    
  } catch (error) {
    console.error('Customers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer data'
    });
  }
});

// Hard delete store with all associated data
app.delete('/api/stores/:storeId', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId = req.userId;
    
    console.log('🗑️ Deleting store:', storeId);
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Start transaction for atomic deletion
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      // 1. Delete all products
      await Product.deleteMany({ store: storeId }).session(session);
      console.log('✅ Products deleted');
      
      // 2. Archive orders (set store reference to null instead of deleting)
      await Order.updateMany(
        { storeId: storeId },
        { 
          $set: { 
            storeId: null,
            store: null,
            notes: `Store "${store.storeName}" was deleted on ${new Date().toISOString()}`
          }
        }
      ).session(session);
      console.log('✅ Orders archived');
      
      // 3. Delete transactions
      await Transaction.deleteMany({ store: storeId }).session(session);
      console.log('✅ Transactions deleted');
      
      // 4. Delete the store
      await Store.deleteOne({ _id: storeId }).session(session);
      console.log('✅ Store deleted');
      
      // 5. Update user
      await User.findByIdAndUpdate(
        userId,
        { 
          $set: { 
            hasStore: false,
            storeId: null,
            storeSlug: null 
          }
        },
        { session }
      );
      console.log('✅ User updated');
      
      // Commit transaction
      await session.commitTransaction();
      session.endSession();
      
      console.log('✅ Store deletion completed successfully');
      
      res.json({
        success: true,
        message: 'Store and all associated data deleted successfully'
      });
      
    } catch (transactionError) {
      await session.abortTransaction();
      session.endSession();
      throw transactionError;
    }
    
  } catch (error) {
    console.error('❌ Store deletion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete store',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete all products for a store
app.delete('/api/stores/:storeId/products/all', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId = req.userId;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    const result = await Product.deleteMany({ store: storeId });
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} products`,
      deletedCount: result.deletedCount
    });
    
  } catch (error) {
    console.error('Delete products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete products'
    });
  }
});

// Real-time dashboard updates via Server-Sent Events (SSE)
app.get('/api/dashboard/realtime', async (req, res) => {
  try {
    // Verify token from query parameter (EventSource doesn't support custom headers)
    const token = req.query.token || req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({ success: false, error: 'Token required' });
    }
    
    let userId;
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
      userId = decoded.userId;
    } catch (error) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx
    
    // Add client to the map
    if (!dashboardClients.has(userId)) {
      dashboardClients.set(userId, new Set());
    }
    dashboardClients.get(userId).add(res);
    
    console.log(`📡 SSE connection established for user: ${userId}`);
    
    // Send initial stats
    const initialStats = await calculateDashboardStats(userId);
    const initialMessage = JSON.stringify({
      type: 'dashboard_update',
      data: initialStats,
      timestamp: new Date().toISOString()
    });
    res.write(`data: ${initialMessage}\n\n`);
    
    // Send heartbeat every 30 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch (error) {
        clearInterval(heartbeatInterval);
      }
    }, 30000);
    
    // Handle client disconnect
    req.on('close', () => {
      console.log(`📡 SSE connection closed for user: ${userId}`);
      clearInterval(heartbeatInterval);
      const clients = dashboardClients.get(userId);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          dashboardClients.delete(userId);
        }
      }
    });
    
    req.on('error', (error) => {
      console.error('SSE connection error:', error);
      clearInterval(heartbeatInterval);
      const clients = dashboardClients.get(userId);
      if (clients) {
        clients.delete(res);
      }
    });
  } catch (error) {
    console.error('SSE setup error:', error);
    res.status(500).json({ success: false, error: 'Failed to establish SSE connection' });
  }
});
// Add this test endpoint in server.js
app.post('/api/test-product', verifyToken, upload.array('images', 10), async (req, res) => {
  try {
    console.log('✅ Test endpoint hit');
    console.log('📝 Body:', req.body);
    console.log('📁 Files:', req.files);
    console.log('👤 User ID:', req.userId);
    
    res.json({
      success: true,
      message: 'Test endpoint working',
      data: {
        body: req.body,
        files: req.files,
        userId: req.userId
      }
    });
  } catch (error) {
    console.error('Test endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
// Recent orders
app.get('/api/dashboard/orders', verifyToken, async (req, res) => {
  try {
    const { limit = 5 } = req.query;
    const userId = req.userId;
    
    // Get user's stores
    const stores = await Store.find({ ownerId: userId });
    const storeIds = stores.map(store => store._id);
    
    const orders = await Order.find({ storeId: { $in: storeIds } })
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .populate('userId', 'name email');
    
    const formattedOrders = orders.map(order => ({
      id: order.orderId,
      customer: order.customer?.name || order.userId?.name || 'Unknown Customer',
      product: order.items.length > 0 
        ? order.items[0].name + (order.items.length > 1 ? ` +${order.items.length - 1} more` : '')
        : 'No items',
      amount: order.total,
      status: order.status,
      date: formatRelativeTime(order.createdAt),
      avatar: getAvatarEmoji(order.customer?.name || order.userId?.name)
    }));
    
    res.json({
      success: true,
      data: formattedOrders
    });
    
  } catch (error) {
    console.error('❌ Dashboard orders error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load orders'
    });
  }
});

// Top products
app.get('/api/dashboard/top-products', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get user's stores
    const stores = await Store.find({ ownerId: userId });
    const storeIds = stores.map(store => store._id);
    
    const products = await Product.find({ 
      store: { $in: storeIds },
      isActive: true
    })
      .sort({ salesCount: -1, revenue: -1 })
      .limit(5)
      .select('name salesCount revenue images');
    
    const formattedProducts = products.map(product => {
      const growth = Math.random() > 0.3 ? '+' + (Math.random() * 30 + 5).toFixed(0) + '%' : '-%';
      
      return {
        name: product.name,
        sales: product.salesCount,
        revenue: product.revenue,
        growth,
        image: product.images?.[0] || null
      };
    });
    
    res.json({
      success: true,
      data: formattedProducts
    });
    
  } catch (error) {
    console.error('❌ Dashboard top-products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load top products'
    });
  }
});

// Revenue trend
app.get('/api/dashboard/revenue-trend', verifyToken, async (req, res) => {
  try {
    const { range = '7d' } = req.query;
    const userId = req.userId;
    
    // Get user's stores
    const stores = await Store.find({ ownerId: userId });
    const storeIds = stores.map(store => store._id);
    
    let days = 7;
    switch(range) {
      case '7d': days = 7; break;
      case '30d': days = 30; break;
      case '90d': days = 90; break;
      case '1y': days = 365; break;
    }
    
    const data = [];
    const now = new Date();
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      const startOfDay = new Date(date.setHours(0, 0, 0, 0));
      const endOfDay = new Date(date.setHours(23, 59, 59, 999));
      
      const revenueAgg = await Order.aggregate([
        { 
          $match: { 
            storeId: { $in: storeIds },
            createdAt: { $gte: startOfDay, $lte: endOfDay },
            status: { $in: ['completed', 'delivered'] },
            'payment.status': 'completed'
          } 
        },
        { 
          $group: { 
            _id: null, 
            revenue: { $sum: '$total' },
            orders: { $sum: 1 }
          } 
        }
      ]);
      
      const label = range === '7d' 
        ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
        : range === '30d' || range === '90d'
        ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      data.push({
        label,
        revenue: revenueAgg[0]?.revenue || 0,
        orders: revenueAgg[0]?.orders || 0
      });
    }
    
    res.json({
      success: true,
      data: data
    });
    
  } catch (error) {
    console.error('❌ Dashboard revenue-trend error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load revenue trend'
    });
  }
});



// ==================== ORDER ROUTES ====================

// Delete order
app.delete('/api/orders/:orderId', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get user's stores
    const stores = await Store.find({ ownerId: userId });
    const storeIds = stores.map(store => store._id);
    
    const order = await Order.findOneAndDelete({ 
      orderId: req.params.orderId,
      storeId: { $in: storeIds }
    });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or unauthorized'
      });
    }
    
    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
    
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete order'
    });
  }
});


// Deliver inventory and get credentials
app.get('/api/orders/:orderId/deliver', verifyToken, async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📦 Fetching delivery for order:', orderId);
    
    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }
    
    // Check if user has access to this order
    if (req.userRole !== 'admin') {
      // Check if user is the buyer or store owner
      const isBuyer = order.userId && order.userId.toString() === req.userId;
      const store = await Store.findById(order.storeId || order.store);
      const isStoreOwner = store && store.owner.toString() === req.userId;
      
      if (!isBuyer && !isStoreOwner) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized'
        });
      }
    }
    
    // Get inventory details for each product
    const deliveryDetails = [];
    
    for (const item of order.items) {
      if (item.productId) {
        try {
          // Find the product
          const product = await Product.findById(item.productId);
          
          if (product && product.inventory?.type !== 'none') {
            // Find the sold inventory item for this order
            const soldItem = product.inventory.items.find(
              invItem => invItem.orderId === orderId && invItem.status === 'sold'
            );
            
            if (soldItem) {
              // Parse credentials
              const credentials = {};
              const pairs = soldItem.details.split('|');
              pairs.forEach(pair => {
                const [key, value] = pair.split(':').map(str => str.trim());
                if (key && value) credentials[key] = value;
              });
              
              deliveryDetails.push({
                productId: product._id,
                productName: product.name,
                credentials,
                deliveredAt: soldItem.soldAt,
                inventoryItemId: soldItem._id
              });
            }
          }
        } catch (productError) {
          console.error('Error processing product:', productError);
        }
      }
    }
    
    if (deliveryDetails.length === 0) {
      return res.json({
        success: false,
        error: 'No inventory delivered yet',
        message: 'Inventory is being processed. Please check back in a few minutes.'
      });
    }
    
    res.json({
      success: true,
      orderId,
      deliveryDetails,
      deliveredAt: new Date()
    });
    
  } catch (error) {
    console.error('Delivery error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch delivery details'
    });
  }
});


// Download file endpoint
app.get('/api/orders/:orderId/download/:productId', verifyToken, async (req, res) => {
  try {
    const { orderId, productId } = req.params;
    
    // Verify order access
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Check authorization
    const isBuyer = order.userId && order.userId.toString() === req.userId;
    const store = await Store.findById(order.storeId || order.store);
    const isStoreOwner = store && store.owner.toString() === req.userId;
    
    if (!isBuyer && !isStoreOwner && req.userRole !== 'admin') {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Get product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    
    // Check if product has digital file
    if (product.digitalFile?.url) {
      // Redirect to the file URL
      return res.redirect(product.digitalFile.url);
    }
    
    // If no file, return credentials as JSON
    const soldItem = product.inventory.items.find(
      item => item.orderId === orderId && item.status === 'sold'
    );
    
    if (soldItem) {
      // Parse credentials
      const credentials = {};
      const pairs = soldItem.details.split('|');
      pairs.forEach(pair => {
        const [key, value] = pair.split(':').map(str => str.trim());
        if (key && value) credentials[key] = value;
      });
      
      return res.json({
        success: true,
        productId,
        productName: product.name,
        credentials,
        message: 'This product contains credentials only. No file download available.'
      });
    }
    
    res.status(404).json({ error: 'No delivery found for this product' });
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});
// ==================== INITIALIZE DEMO DATA ====================

const initializeDemoData = async () => {
  try {
    // Check if we need to create demo data
    const userCount = await User.countDocuments();
    const storeCount = await Store.countDocuments();
    const productCount = await Product.countDocuments();
    const orderCount = await Order.countDocuments();
    
    console.log('📊 Database status:', {
      users: userCount,
      stores: storeCount,
      products: productCount,
      orders: orderCount
    });
    
    if (userCount === 0) {
      // Create admin user
      const adminUser = await User.create({
        name: 'Admin User',
        email: 'admin@example.com',
        password: 'admin123',
        role: 'admin'
      });
      
      console.log('✅ Demo admin user created');
      console.log('📧 Email: admin@example.com');
      console.log('🔑 Password: admin123');
    }
    
    // Create test user with store
    const testUser = await User.findOne({ email: 'test@example.com' });
    if (!testUser) {
      const newUser = await User.create({
        name: 'Test User',
        email: 'test@example.com',
        password: 'test123',
        role: 'user'
      });
      
      // Create a demo store for test user
      const demoStore = await Store.create({
        owner: newUser._id,
        storeName: 'My Awesome Store',
        storeSlug: 'my-awesome-store-' + Math.random().toString(36).substr(2, 5),
        description: 'A demo store for testing',
        contactEmail: 'test@example.com',
        storeType: 'digital',
        isActive: true,
        isPublished: true
      });
      
      await User.findByIdAndUpdate(newUser._id, {
        role: 'store_owner',
        hasStore: true,
        storeId: demoStore._id,
        storeSlug: demoStore.storeSlug
      });
      
      console.log('✅ Demo store user created');
      console.log('📧 Email: test@example.com');
      console.log('🔑 Password: test123');
      console.log('🏪 Store URL: http://localhost:3000/store/' + demoStore.storeSlug);
    }
    
    if (productCount === 0) {
      // Get any store to add products to
      const store = await Store.findOne();
      if (store) {
        const demoProducts = [
          {
            name: 'Premium UI Kit',
            description: 'A modern UI kit with beautiful components',
            price: 79.99,
            comparePrice: 129.99,
            store: store._id,
            owner: store.owner,
            categories: ['ui-kit', 'design'],
            tags: ['premium', 'ui', 'design'],
            type: 'digital',
            isActive: true,
            stock: 100,
            salesCount: 342,
            revenue: 27338.58
          },
          {
            name: 'Crypto Dashboard Template',
            description: 'Complete crypto trading dashboard template',
            price: 149.99,
            comparePrice: 199.99,
            store: store._id,
            owner: store.owner,
            categories: ['template', 'dashboard'],
            tags: ['crypto', 'dashboard', 'trading'],
            type: 'digital',
            isActive: true,
            stock: 50,
            salesCount: 156,
            revenue: 23398.44
          }
        ];
        
        await Product.insertMany(demoProducts);
        console.log(`✅ ${demoProducts.length} demo products created`);
        
        // Update store product count
        await Store.findByIdAndUpdate(store._id, {
          productCount: demoProducts.length
        });
      }
    }
    
    if (orderCount === 0) {
      // Get a store and products to create demo orders
      const store = await Store.findOne();
      const products = await Product.find().limit(2);
      
      if (store && products.length > 0) {
        const demoOrders = [];
        const customerNames = ['Alex Johnson', 'Sarah Miller', 'Mike Wilson', 'Emma Davis'];
        const statuses = ['completed', 'processing', 'pending'];
        
        for (let i = 0; i < 5; i++) {
          const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
          const product = products[Math.floor(Math.random() * products.length)];
          const quantity = Math.floor(Math.random() * 3) + 1;
          const amount = product.price * quantity;
          const status = statuses[Math.floor(Math.random() * statuses.length)];
          
          demoOrders.push({
            orderId: 'ORD-' + Date.now() + '-' + i,
            storeId: store._id,
            userId: store.owner,
            customer: {
              name: customerName,
              email: `${customerName.toLowerCase().replace(' ', '.')}@example.com`
            },
            items: [{
              productId: product._id,
              name: product.name,
              price: product.price,
              quantity: quantity,
              subtotal: amount
            }],
            subtotal: amount,
            total: amount,
            status: status,
            payment: {
              method: ['credit_card', 'paypal', 'stripe'][Math.floor(Math.random() * 3)],
              status: status === 'completed' ? 'completed' : 'pending'
            }
          });
        }
        
        await Order.insertMany(demoOrders);
        console.log(`✅ ${demoOrders.length} demo orders created`);
        
        // Update store order count and revenue
        const revenueAgg = await Order.aggregate([
          { $match: { storeId: store._id, status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$total' } } }
        ]);
        
        await Store.findByIdAndUpdate(store._id, {
          orderCount: demoOrders.length,
          revenue: revenueAgg[0]?.total || 0
        });
      }
    }
    
  } catch (error) {
    console.error('Error initializing demo data:', error);
  }
};

// ==================== ERROR HANDLING ====================
// Add this to server.js - Debug inventory assignment
app.get('/api/debug/inventory/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.json({ error: 'Order not found' });
    }
    
    console.log('🔍 DEBUG ORDER:', {
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      status: order.status,
      inventoryReserved: order.inventoryReserved,
      reservedItems: order.reservedItems
    });
    
    // Check all products in the order
    const productDetails = [];
    
    for (const item of order.items) {
      const product = await Product.findById(item.productId);
      if (product) {
        // Find inventory items for this order
        const inventoryItems = product.inventory?.items?.filter(
          inv => inv.orderId === order.orderId
        );
        
        // Find all available inventory
        const availableItems = product.inventory?.items?.filter(
          inv => inv.status === 'available'
        );
        
        productDetails.push({
          productId: product._id,
          name: product.name,
          inventoryType: product.inventory?.type,
          totalInventory: product.inventory?.items?.length || 0,
          available: availableItems?.length || 0,
          assignedToThisOrder: inventoryItems?.length || 0,
          assignedItems: inventoryItems?.map(i => ({
            status: i.status,
            details: i.details,
            soldAt: i.soldAt
          }))
        });
      }
    }
    
    res.json({
      orderId: order.orderId,
      paymentStatus: order.paymentStatus,
      status: order.status,
      inventoryReserved: order.inventoryReserved,
      reservedItems: order.reservedItems,
      products: productDetails
    });
    
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: error.message });
  }
}); 



// Debug route to check stores and products
app.get('/api/debug/:slug', async (req, res) => {
  try {
    const store = await Store.findOne({ storeSlug: req.params.slug });
    
    if (!store) {
      return res.json({
        success: false,
        message: 'Store not found'
      });
    }
    
    const products = await Product.find({ store: store._id });
    const user = await User.findById(store.ownerId);
    
    res.json({
      success: true,
      data: {
        store,
        products: {
          count: products.length,
          items: products
        },
        owner: {
          name: user?.name,
          email: user?.email
        }
      }
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Store creation route - add logging


// ==================== DASHBOARD FIXES ====================

// Missing dashboard endpoints that your Dashboard.jsx needs
app.get('/api/dashboard/overview', verifyToken, async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get user's stores
    const stores = await Store.find({ owner: userId });
    
    if (stores.length === 0) {
      return res.json({
        success: true,
        data: {
          stores: [],
          stats: {
            totalRevenue: 0,
            totalOrders: 0,
            totalProducts: 0,
            totalCustomers: 0,
            recentOrders: []
          }
        }
      });
    }
    
    const storeIds = stores.map(store => store._id);
    
    // Get store stats
    const productsCount = await Product.countDocuments({ 
      store: { $in: storeIds } 
    });
    
    const ordersCount = await Order.countDocuments({
      $or: [
        { storeId: { $in: storeIds.map(id => id.toString()) } },
        { store: { $in: storeIds } }
      ]
    });
    
    // Get revenue from completed orders
    const revenueAggregation = await Order.aggregate([
      {
        $match: {
          $or: [
            { storeId: { $in: storeIds.map(id => id.toString()) } },
            { store: { $in: storeIds } }
          ],
          paymentStatus: 'paid',
          status: { $in: ['completed', 'delivered'] }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' }
        }
      }
    ]);
    
    const totalRevenue = revenueAggregation[0]?.totalRevenue || 0;
    
    // Get recent orders
    const recentOrders = await Order.find({
      $or: [
        { storeId: { $in: storeIds.map(id => id.toString()) } },
        { store: { $in: storeIds } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    // Format recent orders for frontend
    const formattedOrders = recentOrders.map(order => ({
      id: order.orderId || order._id,
      customer: order.customer?.name || 'Unknown Customer',
      product: order.items?.length > 0 
        ? order.items[0].name + (order.items.length > 1 ? ` +${order.items.length - 1} more` : '')
        : 'No items',
      amount: order.total || 0,
      status: order.status || 'pending',
      date: new Date(order.createdAt).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    }));
    
    res.json({
      success: true,
      data: {
        stores: stores.map(store => ({
          id: store._id,
          name: store.storeName,
          slug: store.storeSlug,
          status: store.status,
          productCount: store.productCount || 0
        })),
        stats: {
          totalRevenue,
          totalOrders: ordersCount,
          totalProducts: productsCount,
          totalCustomers: 0, // You can add customer counting logic
          recentOrders: formattedOrders
        }
      }
    });
    
  } catch (error) {
    console.error('Dashboard overview error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load dashboard data'
    });
  }
});

// Products by store endpoint
// Get products by store ID
app.get('/api/products/store/:storeId', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId = req.userId;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    const products = await Product.find({ store: storeId })
      .select('name price salesCount category inventory images isActive stock description');
    
    res.json({
      success: true,
      data: products
    });
    
  } catch (error) {
    console.error('Get store products error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load products'
    });
  }
});

// Get customers for a store
app.get('/api/stores/:storeId/customers', verifyToken, async (req, res) => {
  try {
    const { storeId } = req.params;
    const userId = req.userId;
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Get all orders for this store
    const orders = await Order.find({
      $or: [
        { storeId: storeId },
        { store: storeId }
      ],
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: -1 });
    
    // Group orders by customer
    const customersMap = {};
    orders.forEach(order => {
      const email = order.customer?.email;
      if (email) {
        if (!customersMap[email]) {
          customersMap[email] = {
            email: email,
            name: order.customer?.name || 'Unknown',
            totalOrders: 0,
            totalSpent: 0,
            orders: [],
            lastOrder: order.createdAt
          };
        }
        customersMap[email].totalOrders += 1;
        customersMap[email].totalSpent += (order.total || 0);
        customersMap[email].orders.push({
          orderId: order.orderId,
          amount: order.total,
          status: order.status,
          date: order.createdAt
        });
        if (order.createdAt > customersMap[email].lastOrder) {
          customersMap[email].lastOrder = order.createdAt;
        }
      }
    });
    
    // Convert to array and calculate metrics
    const customers = Object.values(customersMap).map(customer => {
      const avgOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;
      
      // Determine loyalty level
      let loyaltyLevel = 'New';
      if (customer.totalOrders >= 10) loyaltyLevel = 'VIP';
      else if (customer.totalOrders >= 3) loyaltyLevel = 'Regular';
      
      return {
        ...customer,
        avgOrderValue,
        loyaltyLevel,
        lastOrder: customer.lastOrder ? new Date(customer.lastOrder).toISOString() : null
      };
    });
    
    // Sort by total spent
    customers.sort((a, b) => b.totalSpent - a.totalSpent);
    
    res.json({
      success: true,
      data: customers
    });
    
  } catch (error) {
    console.error('Get store customers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load customers'
    });
  }
});

// Enhanced dashboard analytics endpoint
app.get('/api/dashboard/enhanced-analytics', verifyToken, async (req, res) => {
  try {
    const { storeId, range = '30d' } = req.query;
    const userId = req.userId;
    
    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }
    
    // Verify store ownership
    const store = await Store.findOne({
      _id: storeId,
      owner: userId
    });
    
    if (!store) {
      return res.status(403).json({
        success: false,
        error: 'Store not found or unauthorized'
      });
    }
    
    // Calculate date range
    const now = new Date();
    const startDate = new Date();
    
    switch(range) {
      case '24h': startDate.setDate(now.getDate() - 1); break;
      case '7d': startDate.setDate(now.getDate() - 7); break;
      case '30d': startDate.setDate(now.getDate() - 30); break;
      case '90d': startDate.setDate(now.getDate() - 90); break;
      case '1y': startDate.setFullYear(now.getFullYear() - 1); break;
      default: startDate.setDate(now.getDate() - 30);
    }
    
    // Get all data
    const [orders, products, customersRes] = await Promise.all([
      Order.find({
        $or: [
          { storeId: storeId },
          { store: storeId }
        ],
        createdAt: { $gte: startDate }
      }),
      Product.find({ store: storeId }),
      // We'll reuse the customers logic from above
      (async () => {
        const ordersForCustomers = await Order.find({
          $or: [
            { storeId: storeId },
            { store: storeId }
          ]
        });
        
        const customersMap = {};
        ordersForCustomers.forEach(order => {
          const email = order.customer?.email;
          if (email) {
            if (!customersMap[email]) {
              customersMap[email] = {
                email: email,
                name: order.customer?.name || 'Unknown',
                totalOrders: 0,
                totalSpent: 0,
                lastOrder: order.createdAt
              };
            }
            customersMap[email].totalOrders += 1;
            customersMap[email].totalSpent += (order.total || 0);
            if (order.createdAt > customersMap[email].lastOrder) {
              customersMap[email].lastOrder = order.createdAt;
            }
          }
        });
        
        return Object.values(customersMap);
      })()
    ]);
    
    // Calculate analytics
    const analytics = {
      totalOrders: orders.length,
      statusAnalysis: {},
      paymentAnalysis: {},
      customerAnalysis: {
        totalCustomers: customersRes.length,
        repeatCustomers: customersRes.filter(c => c.totalOrders > 1).length,
        repeatRate: customersRes.length > 0 
          ? (customersRes.filter(c => c.totalOrders > 1).length / customersRes.length) * 100 
          : 0,
        growth: 0 // You'd need historical data for this
      },
      categoryAnalysis: {},
      topProducts: []
    };
    
    // Fill in status analysis
    orders.forEach(order => {
      const status = order.status || 'pending';
      analytics.statusAnalysis[status] = (analytics.statusAnalysis[status] || 0) + 1;
      
      // Payment method analysis
      const method = order.payment?.method || 'unknown';
      analytics.paymentAnalysis[method] = (analytics.paymentAnalysis[method] || 0) + 1;
    });
    
    // Fill in category analysis
    products.forEach(product => {
      const category = product.category || 'Uncategorized';
      analytics.categoryAnalysis[category] = (analytics.categoryAnalysis[category] || 0) + 1;
    });
    
    // Get top products
    const productSales = {};
    orders.forEach(order => {
      order.items?.forEach(item => {
        const productId = item.productId?.toString();
        if (productId) {
          if (!productSales[productId]) {
            const product = products.find(p => p._id.toString() === productId);
            productSales[productId] = {
              name: product?.name || item.name,
              sales: 0,
              revenue: 0
            };
          }
          productSales[productId].sales += (item.quantity || 1);
          productSales[productId].revenue += (item.price || 0) * (item.quantity || 1);
        }
      });
    });
    
    analytics.topProducts = Object.values(productSales)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
    
    res.json({
      success: true,
      data: analytics
    });
    
  } catch (error) {
    console.error('Enhanced analytics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});
// Dashboard test endpoint
app.get('/api/dashboard/test', verifyToken, (req, res) => {
  res.json({
    success: true,
    message: 'Dashboard API is working!',
    userId: req.userId,
    userRole: req.userRole,
    timestamp: new Date().toISOString()
  });
});

// ==================== END OF DASHBOARD FIXES ====================

app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    return res.status(400).json({
      success: false,
      error: `File upload error: ${err.message}`
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});
// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found'
  });
});

// ==================== START SERVER ====================
// ==================== START SERVER ====================

const PORT = process.env.PORT || 5000;

// Create HTTP server explicitly
const http = require('http');
const server = http.createServer(app);

// Setup unified WebSocket server for owner dashboard
const UnifiedOwnerWebSocketServer = require('./websocket/unifiedOwnerWebSocket');
const unifiedOwnerWebSocket = new UnifiedOwnerWebSocketServer(server);
global.unifiedOwnerWebSocket = unifiedOwnerWebSocket;
// Start the server
server.listen(PORT, async () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔑 API Test: http://localhost:${PORT}/api/test`);
  console.log(`📡 WebSocket server ready for owner dashboard`);
  
  // Initialize demo data after a short delay
  setTimeout(initializeDemoData, 2000);
});