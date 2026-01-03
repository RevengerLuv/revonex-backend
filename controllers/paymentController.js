// server/controllers/paymentController.js
const crypto = require('crypto');
const Order = require('../models/Order');
const Transaction = require('../models/Transaction');
const InventoryService = require('../services/inventoryService');
const Product = require('../models/Products');
const User = require('../models/User');
// Initialize Razorpay dynamically when needed
let razorpay = null;

const getRazorpayInstance = () => {
  if (!razorpay) {
    const Razorpay = require('razorpay');
    const key_id = process.env.RAZORPAY_KEY_ID;
    const key_secret = process.env.RAZORPAY_SECRET;
    
    console.log('🔑 Razorpay Config Check:', {
      key_id: key_id ? '✅ Present' : '❌ Missing',
      key_secret: key_secret ? '✅ Present' : '❌ Missing',
      node_env: process.env.NODE_ENV
    });
    
    if (!key_id || !key_secret) {
      throw new Error('Razorpay credentials not configured');
    }
    
    razorpay = new Razorpay({
      key_id: key_id,
      key_secret: key_secret
    });
  }
  return razorpay;
};

// Check inventory before creating order
const checkInventoryBeforePayment = async (req, res, next) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return next();
    }
    
    console.log('📦 Checking inventory for order items:', items.length);
    
    const inventoryResults = [];
    const outOfStockItems = [];
    
    // Check each product's inventory
    for (const item of items) {
      try {
        const check = await InventoryService.checkInventoryAvailability(
          item.productId,
          item.quantity || 1
        );
        
        inventoryResults.push({
          productId: item.productId,
          ...check
        });
        
        // Track out of stock items that require inventory
        if (!check.available && check.reason !== 'NO_INVENTORY_REQUIRED') {
          outOfStockItems.push({
            productId: item.productId,
            productName: check.productName,
            available: check.availableCount,
            required: item.quantity || 1
          });
        }
      } catch (error) {
        console.error(`Inventory check error for product ${item.productId}:`, error);
        outOfStockItems.push({
          productId: item.productId,
          error: error.message
        });
      }
    }
    
    // Block order if any required inventory is out of stock
    if (outOfStockItems.length > 0) {
      console.log('❌ Order blocked - out of stock:', outOfStockItems);
      return res.status(400).json({
        success: false,
        error: 'OUT_OF_STOCK',
        message: 'Some products are out of stock',
        outOfStockItems
      });
    }
    
    // Store inventory results for later use
    req.inventoryResults = inventoryResults;
    next();
    
  } catch (error) {
    console.error('Inventory check error:', error);
    res.status(500).json({
      success: false,
      error: 'INVENTORY_CHECK_FAILED',
      message: error.message
    });
  }
};

// Reserve inventory when payment is initiated
const reserveInventoryOnPaymentInit = async (req, res, next) => {
  try {
    const { orderId, items, customer } = req.body;
    
    if (!orderId || !items || !customer?.email) {
      return next();
    }
    
    console.log('🔒 Reserving inventory for order:', orderId);
    
    const reservations = [];
    
    // Reserve inventory for each item
    for (const item of items) {
      const quantity = item.quantity || 1;
      
      // Check if product needs inventory
      const inventoryCheck = req.inventoryResults?.find(
        r => r.productId.toString() === item.productId.toString()
      );
      
      if (inventoryCheck && inventoryCheck.reason !== 'NO_INVENTORY_REQUIRED') {
        // Reserve inventory for each unit
        for (let i = 0; i < quantity; i++) {
          try {
            const reservation = await InventoryService.reserveInventory(
              item.productId,
              orderId,
              customer.email
            );
            reservations.push(reservation);
            console.log(`✅ Reserved inventory for ${item.productId}:`, reservation.inventoryItemId);
          } catch (reserveError) {
            // Release any already reserved items
            console.error('Failed to reserve inventory, releasing...');
            await Promise.all(
              reservations.map(res => 
                InventoryService.releaseInventory(
                  res.productId,
                  orderId,
                  res.inventoryItemId
                ).catch(() => {})
              )
            );
            
            throw new Error(`Failed to reserve inventory for ${item.productId}: ${reserveError.message}`);
          }
        }
      }
    }
    
    // Store reservations in transaction for later confirmation
    req.inventoryReservations = reservations;
    
    console.log(`✅ Reserved ${reservations.length} inventory items for order ${orderId}`);
    next();
    
  } catch (error) {
    console.error('Inventory reservation error:', error);
    res.status(500).json({
      success: false,
      error: 'INVENTORY_RESERVATION_FAILED',
      message: error.message
    });
  }
};

// Create Razorpay Order
const createRazorpayOrder = async (req, res) => {
  try {
    const { 
      orderId, 
      storeId, 
      amount, 
      currency = 'INR',
      // Subscription specific fields
      planId,
      planName,
      billingCycle,
      userId,
      customerEmail,
      customerName
    } = req.body;
    
    console.log('💳 Creating Razorpay order:', { 
      orderId, 
      storeId, 
      amount,
      planId,
      planName,
      type: planId ? 'subscription' : 'store_order'
    });
    
    // Validate based on payment type
    if (planId) {
      // Subscription payment validation
      if (!planId || !planName || !amount) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing required fields for subscription: planId, planName, amount' 
        });
      }
    } else {
      // Store order validation
      if (!orderId || !storeId || !amount) {
        return res.status(400).json({ 
          success: false,
          error: 'Missing required fields for store order: orderId, storeId, amount' 
        });
      }
    }
    
    // Get Razorpay instance
    const razorpayInstance = getRazorpayInstance();
    
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: currency,
      receipt: planId ? `sub_${Date.now()}` : `receipt_${orderId}`,
      payment_capture: 1,
      notes: {}
    };
    
    // Set notes based on payment type
    if (planId) {
      // Subscription payment notes
      options.notes = {
        type: 'subscription',
        planId: planId,
        planName: planName,
        billingCycle: billingCycle || 'monthly',
        userId: userId,
        customerEmail: customerEmail,
        customerName: customerName
      };
    } else {
      // Store order notes
      options.notes = {
        type: 'store_order',
        orderId: orderId,
        storeId: storeId
      };
    }
    
    console.log('📦 Razorpay options:', options);
    
    const razorpayOrder = await razorpayInstance.orders.create(options);
    
    console.log('✅ Razorpay order created:', razorpayOrder.id);
    
    // Handle transaction creation based on payment type
    if (planId) {
      // Create subscription transaction
      const subscriptionTransaction = new Transaction({
        transactionId: razorpayOrder.id,
        orderId: `SUB_${Date.now()}_${userId || 'anonymous'}`,
        store: null, // Subscription payment, not store-specific
        customer: {
          name: customerName,
          email: customerEmail
        },
        amount: amount,
        currency: currency,
        gateway: 'razorpay',
        status: 'created',
        paymentDetails: {
          razorpay_order_id: razorpayOrder.id,
          planId: planId,
          planName: planName,
          billingCycle: billingCycle
        },
        metadata: {
          type: 'subscription_upgrade',
          userId: userId,
          planId: planId,
          planName: planName,
          billingCycle: billingCycle
        },
        isTest: process.env.NODE_ENV === 'development'
      });
      
      await subscriptionTransaction.save();
      
      res.json({
        success: true,
        order: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          created_at: razorpayOrder.created_at
        },
        message: 'Subscription payment order created successfully',
        transactionId: subscriptionTransaction._id,
        key: process.env.RAZORPAY_KEY_ID
      });
      
    } else {
      // Store order transaction (existing logic)
      const transaction = new Transaction({
        transactionId: razorpayOrder.id,
        orderId: orderId,
        store: storeId,
        amount: amount,
        currency: currency,
        gateway: 'razorpay',
        status: 'created',
        paymentDetails: {
          razorpay_order_id: razorpayOrder.id
        },
        // Store inventory reservations for later confirmation
        metadata: {
          inventoryReservations: req.inventoryReservations || [],
          inventoryChecked: true
        },
        isTest: process.env.NODE_ENV === 'development'
      });
      
      await transaction.save();
      
      // Update order with inventory reservation info
      const order = await Order.findOne({ orderId });
      if (order && req.inventoryReservations?.length > 0) {
        order.inventoryReserved = true;
        order.reservedItems = req.inventoryReservations.map(res => ({
          productId: res.productId,
          inventoryItemId: res.inventoryItemId,
          reservedAt: new Date()
        }));
        await order.save();
      }
      
      res.json({
        success: true,
        order: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency
        },
        key: process.env.RAZORPAY_KEY_ID,
        transaction: {
          id: transaction._id,
          status: transaction.status
        },
        inventoryReserved: req.inventoryReservations?.length > 0
      });
    }
    
  } catch (error) {
    console.error('❌ Razorpay order error:', error);
    
    // Release inventory if order creation fails for store orders
    if (!req.body.planId && req.inventoryReservations?.length > 0) {
      console.log('🔄 Releasing inventory due to order creation failure');
      await Promise.all(
        req.inventoryReservations.map(res => 
          InventoryService.releaseInventory(
            res.productId,
            req.body.orderId,
            res.inventoryItemId
          ).catch(() => {})
        )
      );
    }
    
    res.status(500).json({ 
      success: false,
      error: error.message || 'Failed to create payment order' 
    });
  }
};

// Verify Razorpay Payment and confirm inventory
const verifyPayment = async (req, res) => {
  try {
    const { 
      razorpay_order_id, 
      razorpay_payment_id, 
      razorpay_signature,
      // Subscription specific fields
      planId,
      planName,
      price,
      billingCycle,
      userId
    } = req.body;
    
    console.log('🔍 Verifying payment:', { 
      razorpay_order_id,
      razorpay_payment_id,
      planId,
      type: planId ? 'subscription' : 'store_order'
    });
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing payment verification details' 
      });
    }
    
    // Verify the payment signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    const isSignatureValid = expectedSignature === razorpay_signature;
    
    if (!isSignatureValid) {
      console.error('❌ Invalid payment signature');
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid payment signature' 
      });
    }
     const domainOrder = new DomainOrder({
    orderId: razorpayOrder.id,
    paymentId: razorpay_payment_id,
    domain: req.body.domain,
    duration: req.body.duration,
    amount: req.body.amount,
    userId: req.user._id,
    storeId: req.body.storeId,
    status: 'pending', // Starts as pending for owner to process
    tld: req.body.domain.split('.').pop(),
    pricing: req.body.pricing
  });
  
  await domainOrder.save();
    // Find the transaction
    const transaction = await Transaction.findOne({ 
      transactionId: razorpay_order_id 
    });
    
    if (!transaction) {
      console.error('❌ Transaction not found:', razorpay_order_id);
      return res.status(404).json({ 
        success: false, 
        error: 'Transaction not found' 
      });
    }
    
    // Update transaction with payment details
    transaction.status = 'completed';
    transaction.paymentDetails.razorpay_payment_id = razorpay_payment_id;
    transaction.paymentDetails.razorpay_signature = razorpay_signature;
    transaction.updatedAt = new Date();
    
    // Handle based on payment type
    if (planId) {
      // Subscription payment verification
      console.log('✅ Subscription payment verified:', { planId, planName, userId });
      
      // Update subscription in user's account
      if (userId) {
        const user = await User.findById(userId);
        if (user) {
          user.subscription = {
            plan: planId,
            planName: planName,
            price: price || 0,
            status: 'active',
            startDate: new Date(),
            nextBillingDate: new Date(Date.now() + (billingCycle === 'yearly' ? 365 : 30) * 24 * 60 * 60 * 1000),
            billingCycle: billingCycle || 'monthly',
            transactionId: transaction.transactionId,
            razorpayPaymentId: razorpay_payment_id,
            razorpayOrderId: razorpay_order_id,
            features: getPlanFeatures(planId) // Helper function to get features based on plan
          };
          
          await user.save();
          console.log('✅ User subscription updated:', user.email, planName);
        }
      }
      
      // Update transaction metadata for subscription
      transaction.metadata.set('subscriptionActivated', true);
      transaction.metadata.set('activatedAt', new Date());
      
    } else {
      // Store order payment verification (existing logic)
      console.log('✅ Store payment verified for order:', transaction.orderId);

      // Update order status
      const order = await Order.findOne({ orderId: transaction.orderId });
      if (order) {
        order.status = 'completed';
        order.paymentStatus = 'paid';
        order.paymentMethod = 'razorpay';
        order.paymentDetails = {
          transactionId: transaction.transactionId,
          razorpayPaymentId: razorpay_payment_id,
          razorpayOrderId: razorpay_order_id
        };
        order.paidAt = new Date();

        // Update inventory if reservations exist
        if (order.reservedItems && order.reservedItems.length > 0) {
          console.log('📦 Confirming inventory reservations for order:', order.orderId);
          for (const item of order.reservedItems) {
            await InventoryService.confirmInventorySale(
              item.productId,
              order.orderId,
              item.inventoryItemId
            );
          }
          order.inventoryConfirmed = true;
        }

        await order.save();
        console.log('✅ Order updated:', order.orderId);

        // Update store balance - credit the store with the payment amount
        const Store = require('../models/Store');
        const store = await Store.findById(order.store);
        if (store) {
          // Calculate net amount after any platform fees (if applicable)
          const netAmount = transaction.amount; // Full amount for now, can add fees later
          const previousBalance = store.balance || 0;
          store.balance = previousBalance + netAmount;

          // Update store analytics
          store.analytics.totalSales = (store.analytics.totalSales || 0) + 1;
          store.analytics.revenue = (store.analytics.revenue || 0) + netAmount;

          await store.save();
          console.log('💰 Store balance updated:', {
            storeName: store.storeName,
            orderId: order.orderId,
            previousBalance,
            netAmount,
            newBalance: store.balance
          });
        } else {
          console.error('❌ Store not found for balance update:', order.store);
        }
      }
      
      // Update transaction for store order
      transaction.status = 'completed';
      transaction.paymentDetails.razorpay_payment_id = razorpay_payment_id;
      transaction.paymentDetails.razorpay_signature = razorpay_signature;
    }
    
    await transaction.save();
    
    const responseData = {
      success: true,
      message: planId ? 'Subscription payment successful!' : 'Payment successful!',
      orderId: transaction.orderId,
      transactionId: transaction._id,
      razorpayPaymentId: razorpay_payment_id,
      status: 'completed'
    };
    
    // Add subscription info if applicable
    if (planId) {
      responseData.subscription = {
        plan: planId,
        planName: planName,
        status: 'active'
      };
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Payment verification error:', error);
    
    // Update transaction status to failed
    try {
      const transaction = await Transaction.findOne({ 
        transactionId: req.body.razorpay_order_id 
      });
      if (transaction) {
        transaction.status = 'failed';
        transaction.error = error.message;
        await transaction.save();
      }
    } catch (saveError) {
      console.error('Failed to update transaction status:', saveError);
    }
    
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Payment verification failed' 
    });
  }
};

// Helper function to get plan features
const getPlanFeatures = (planId) => {
  const featuresMap = {
    free: [
      'Up to 25 products',
      'Community support',
      '512 MB storage',
      'Basic store analytics',
      'Platform branding',
      'Manual order delivery',
      'Limited customization',
      'Basic fraud protection'
    ],
    starter: [
      'Up to 100 products',
      'Basic analytics dashboard',
      'Email support',
      '2GB storage',
      'Standard themes',
      'Data export & backup',
      'Custom domain support',
      'Manual + semi-automatic delivery',
      'Discount codes & coupons',
      'Basic SEO settings'
    ],
    pro: [
      'Unlimited products',
      'Advanced analytics & reports',
      'Priority support (24/7)',
      '10GB storage',
      'Custom themes',
      'Drag & drop store builder',
      'Fully automated delivery',
      'API access',
      'Team collaboration'
    ],
    enterprise: [
      'Everything in Pro',
      'Unlimited storage',
      'White-label solution',
      'Dedicated account manager'
    ]
  };
  
  return featuresMap[planId] || featuresMap.free;
};
// Get payment status with inventory info
const getPaymentStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    
    console.log('📊 Getting payment status for:', orderId);
    
    // Try to find in transactions first
    let transaction = await Transaction.findOne({ orderId });
    
    // If not found in transactions, check order directly
    if (!transaction) {
      const order = await Order.findOne({ orderId });
      
      if (!order) {
        return res.status(404).json({ 
          success: false,
          error: 'Order not found' 
        });
      }
      
      return res.json({
        success: true,
        status: order.paymentStatus,
        order: {
          id: order.orderId,
          total: order.total,
          currency: order.currency,
          items: order.items,
          inventoryStatus: order.inventoryReserved ? 'reserved' : 'not_reserved'
        }
      });
    }
    
    // Get order for inventory details
    const order = await Order.findOne({ orderId });
    const inventoryStatus = order?.inventoryReserved ? 'reserved' : 'not_reserved';
    const inventoryDelivered = order?.items?.some(item => item.inventoryAssigned);
    
    res.json({
      success: true,
      status: transaction.status,
      inventoryStatus,
      inventoryDelivered,
      transaction: {
        id: transaction.transactionId,
        amount: transaction.amount,
        currency: transaction.currency,
        gateway: transaction.gateway,
        createdAt: transaction.createdAt
      }
    });
    
  } catch (error) {
    console.error('❌ Get payment status error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Create UPI Payment
const createUPIPayment = async (req, res) => {
  try {
    const { orderId, storeId, upiId } = req.body;
    
    console.log('📱 Creating UPI payment for:', orderId);
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }
    
    // Generate UPI payment link
    const upiPayment = {
      upiId: upiId || 'test@razorpay',
      amount: order.total,
      currency: 'INR',
      paymentUrl: `upi://pay?pa=${upiId || 'test@razorpay'}&pn=${encodeURIComponent(order.storeId)}&am=${order.total}&cu=INR&tn=Order:${order.orderId}`
    };
    
    // Save transaction
    const transaction = new Transaction({
      transactionId: `upi_${Date.now()}`,
      orderId: orderId,
      store: storeId,
      amount: order.total,
      currency: 'INR',
      gateway: 'upi',
      status: 'pending',
      paymentDetails: {
        upi_id: upiId
      }
    });
    
    await transaction.save();
    
    res.json({
      success: true,
      payment: upiPayment,
      transactionId: transaction.transactionId
    });
    
  } catch (error) {
    console.error('❌ UPI payment error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Create Crypto Payment (Mock for testing)
const createCryptoPayment = async (req, res) => {
  try {
    const { orderId, storeId } = req.body;
    
    console.log('₿ Creating crypto payment for:', orderId);
    
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ 
        success: false,
        error: 'Order not found' 
      });
    }
    
    // Mock crypto payment for testing
    const cryptoPayment = {
      paymentId: `crypto_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: order.orderId,
      amount: order.total,
      cryptocurrency: 'BTC',
      status: 'pending',
      paymentAddress: '1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX',
      paymentUrl: `https://revonex.store//payment/crypto/${order.orderId}`,
      instructions: 'For testing: This is a mock crypto payment'
    };
    
    // Save transaction
    const transaction = new Transaction({
      transactionId: cryptoPayment.paymentId,
      orderId: orderId,
      store: storeId,
      amount: order.total,
      currency: 'INR',
      gateway: 'crypto',
      status: 'pending',
      paymentDetails: cryptoPayment
    });
    
    await transaction.save();
    
    res.json({
      success: true,
      payment: cryptoPayment,
      transactionId: transaction.transactionId
    });
    
  } catch (error) {
    console.error('❌ Crypto payment error:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
};

// Webhook handler for Razorpay (optional)
const razorpayWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Verify webhook signature
    const signature = req.headers['x-razorpay-signature'];
    const body = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    
    const event = req.body.event;
    const payment = req.body.payload.payment.entity;
    
    console.log('📢 Razorpay Webhook:', event, payment.id);
    
    // Handle different webhook events
    switch (event) {
      case 'payment.captured':
        // Update transaction and order status
        await updatePaymentStatus(payment.order_id, 'completed', payment);
        break;
      case 'payment.failed':
        await updatePaymentStatus(payment.order_id, 'failed', payment);
        break;
      case 'payment.refunded':
        await updatePaymentStatus(payment.order_id, 'refunded', payment);
        break;
    }
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('❌ Webhook error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Helper function to map external status to internal status
function mapStatus(status) {
  switch (status) {
    case 'paid':
    case 'captured':
      return 'completed';
    case 'failed':
      return 'failed';
    case 'refunded':
      return 'refunded';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'completed';
  }
}

// Helper function to update payment status
async function updatePaymentStatus(razorpayOrderId, status, paymentDetails) {
  try {
    // Map the external status to internal status
    const mappedStatus = mapStatus(status);

    // Find transaction
    const transaction = await Transaction.findOne({
      transactionId: razorpayOrderId
    });

    if (transaction) {
      transaction.status = mappedStatus;
      transaction.paymentDetails = {
        ...transaction.paymentDetails,
        ...paymentDetails
      };
      await transaction.save();

      // Update order
      const order = await Order.findOne({ orderId: transaction.orderId });
      if (order) {
        order.paymentStatus = mappedStatus === 'completed' ? 'paid' : mappedStatus;
        if (mappedStatus === 'completed') {
          order.status = 'completed';
        }
        await order.save();
      }
    }
  } catch (error) {
    console.error('Update payment status error:', error);
  }
}

// Send order confirmation email
async function sendOrderConfirmation(order) {
  // Email sending logic
  console.log(`📧 Order ${order.orderId} confirmed. Email would be sent to ${order.customer?.email}`);
}

// Get delivery details for customer
const getDeliveryDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
    console.log('📦 Getting delivery details for order:', orderId);
    
    // Find order
    const order = await Order.findOne({ orderId, userId });
    
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found or unauthorized'
      });
    }
    
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({
        success: false,
        error: 'Payment not completed'
      });
    }
    
    // Get inventory details for each product
    const deliveryDetails = [];
    
    for (const item of order.items) {
      if (item.inventoryAssigned && item.deliveryDetails?.credentials) {
        const credentials = InventoryService.parseCredentials(item.deliveryDetails.credentials);
        
        deliveryDetails.push({
          productId: item.productId,
          productName: item.name,
          credentials,
          deliveredAt: item.deliveryDetails.deliveredAt,
          deliveryMethod: item.deliveryDetails.deliveryMethod
        });
      }
    }
    
    res.json({
      success: true,
      orderId,
      deliveryDetails,
      hasCredentials: deliveryDetails.length > 0
    });
    
  } catch (error) {
    console.error('Get delivery details error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

// Export as default object for backward compatibility
module.exports = {
  checkInventoryBeforePayment,
  reserveInventoryOnPaymentInit,
  createRazorpayOrder,
  verifyPayment,
  getPaymentStatus,
  createUPIPayment,
  createCryptoPayment,
  razorpayWebhook,
  getDeliveryDetails
};