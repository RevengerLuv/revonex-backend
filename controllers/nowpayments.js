const axios = require('axios');
const crypto = require('crypto');
const Transaction = require('../models/Transaction');
const Order = require('../models/Order');
const Store = require('../models/Store');

// Verify IPN signature
function verifyIPN(req) {
  const signature = req.headers['x-nowpayments-sig'];
  const payload = req.body.toString();
  
  if (!signature || !payload) {
    return false;
  }

  const hmac = crypto.createHmac('sha512', process.env.NOWPAYMENTS_WEBHOOK_SECRET);
  const calculatedSignature = hmac.update(payload).digest('hex');
  
  return signature === calculatedSignature;
}

// Create NOWPayments invoice
async function createInvoice(req, res) {
  try {
    const { orderId, amount, currency = 'INR', coin = 'btc' } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: orderId, amount'
      });
    }
    
    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found'
      });
    }
    
    // Find the store to get wallet address - try both store (ObjectId) and storeId (String)
    let store = null;
    if (order.store) {
      store = await Store.findById(order.store);
    }
    if (!store && order.storeId) {
      // Try finding by storeId string
      store = await Store.findById(order.storeId);
    }
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }
    
    // Get wallet address - check multiple sources
    let walletAddress = null;
    let paymentMethods = store.paymentMethods;
    
    // Handle case where paymentMethods might be stored as a string (JSON)
    if (typeof paymentMethods === 'string') {
      try {
        paymentMethods = JSON.parse(paymentMethods);
      } catch (e) {
        console.error('Error parsing paymentMethods:', e);
        paymentMethods = null;
      }
    }
    
    // Strategy 1: Check paymentMethods.crypto.wallets for the selected coin
    if (paymentMethods && paymentMethods.crypto && paymentMethods.crypto.wallets) {
      const wallets = paymentMethods.crypto.wallets;
      
      // Try to get wallet for the selected coin
      if (wallets[coin] && wallets[coin].trim() !== '') {
        walletAddress = wallets[coin];
      } else {
        // Try any available wallet from paymentMethods
        const firstAvailable = Object.keys(wallets).find(key => wallets[key] && wallets[key].trim() !== '');
        walletAddress = firstAvailable ? wallets[firstAvailable] : null;
      }
    }
    
    // Strategy 2: Fallback to cryptoWallet field (legacy support)
    if (!walletAddress && store.cryptoWallet && store.cryptoWallet.trim() !== '') {
      walletAddress = store.cryptoWallet;
      
      // If we found cryptoWallet but paymentMethods doesn't have it, sync it
      if (!paymentMethods || !paymentMethods.crypto || !paymentMethods.crypto.wallets) {
        console.log('🔄 Syncing cryptoWallet to paymentMethods for store:', store._id);
        try {
          if (!paymentMethods) paymentMethods = {};
          if (!paymentMethods.crypto) paymentMethods.crypto = {};
          if (!paymentMethods.crypto.wallets) paymentMethods.crypto.wallets = {};
          
          // Add cryptoWallet to paymentMethods for the preferred currency or 'btc' as default
          const defaultCoin = store.preferredCryptoCurrency || 'btc';
          paymentMethods.crypto.wallets[defaultCoin] = store.cryptoWallet;
          if (!paymentMethods.crypto.selected) {
            paymentMethods.crypto.selected = [defaultCoin];
          }
          
          // Save the synced paymentMethods
          store.paymentMethods = paymentMethods;
          await store.save();
          console.log('✅ Synced cryptoWallet to paymentMethods');
        } catch (syncError) {
          console.error('❌ Error syncing paymentMethods:', syncError);
        }
      }
    }
    
    // Debug logging
    console.log('🔍 Crypto wallet check:', {
      storeId: store._id,
      storeName: store.storeName,
      hasPaymentMethods: !!paymentMethods,
      paymentMethodsType: typeof paymentMethods,
      paymentMethodsKeys: paymentMethods ? Object.keys(paymentMethods) : [],
      hasCrypto: !!(paymentMethods && paymentMethods.crypto),
      cryptoKeys: paymentMethods && paymentMethods.crypto ? Object.keys(paymentMethods.crypto) : [],
      hasWallets: !!(paymentMethods && paymentMethods.crypto && paymentMethods.crypto.wallets),
      walletsKeys: paymentMethods && paymentMethods.crypto && paymentMethods.crypto.wallets ? Object.keys(paymentMethods.crypto.wallets) : [],
      selectedCoin: coin,
      walletAddress: walletAddress ? walletAddress.substring(0, 10) + '...' : 'not found',
      cryptoWallet: store.cryptoWallet ? store.cryptoWallet.substring(0, 10) + '...' : 'missing',
      cryptoPaymentEnabled: store.cryptoPaymentEnabled
    });
    
    if (!walletAddress) {
      // Enhanced error message with helpful information
      const errorDetails = {
        success: false,
        error: 'Store does not have a crypto wallet configured',
        message: 'Please configure a crypto wallet address in your store settings before accepting crypto payments.',
        storeId: store._id.toString(),
        storeName: store.storeName
      };
      
      if (process.env.NODE_ENV === 'development') {
        errorDetails.debug = {
          hasPaymentMethods: !!paymentMethods,
          paymentMethodsStructure: paymentMethods ? {
            hasCrypto: !!paymentMethods.crypto,
            cryptoKeys: paymentMethods.crypto ? Object.keys(paymentMethods.crypto) : [],
            hasWallets: !!(paymentMethods.crypto && paymentMethods.crypto.wallets),
            walletsCount: paymentMethods.crypto && paymentMethods.crypto.wallets ? Object.keys(paymentMethods.crypto.wallets).length : 0
          } : null,
          hasCryptoWallet: !!store.cryptoWallet,
          cryptoWalletValue: store.cryptoWallet || null,
          cryptoPaymentEnabled: store.cryptoPaymentEnabled,
          selectedCoin: coin
        };
      }
      
      return res.status(400).json(errorDetails);
    }
    
    // Calculate platform fee (2%)
    const platformFee = amount * 0.02;
    const netAmount = amount - platformFee;
    
    // Create NOWPayments invoice
    const response = await axios.post(
      'https://api.nowpayments.io/v1/invoice',
      {
        price_amount: amount,
        price_currency: currency,
        pay_currency: coin,
        order_id: orderId,
        order_description: `Payment for order ${orderId}`,
        ipn_callback_url: `${process.env.BASE_URL || 'http://localhost:5000'}/api/nowpayments/webhook`,
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/success/${orderId}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/order/cancel/${orderId}`,
        payout_address: walletAddress,
        payout_currency: coin,
        payout_amount: netAmount.toString(),
        fee_address: process.env.PLATFORM_WALLET,
        fee_amount: platformFee.toString()
      },
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Save transaction record
    const transaction = new Transaction({
      transactionId: response.data.id || `nowpay_${Date.now()}`,
      orderId: orderId,
      store: order.storeId,
      amount: amount,
      netAmount: netAmount,
      platformFee: platformFee,
      currency: currency,
      gateway: 'nowpayments',
      status: 'pending',
      paymentDetails: {
        invoice_id: response.data.id,
        invoice_url: response.data.invoice_url,
        payout_address: walletAddress,
        payout_amount: netAmount,
        platform_fee: platformFee,
        platform_wallet: process.env.PLATFORM_WALLET,
        cryptocurrency: coin
      },
      metadata: {
        storeWallet: walletAddress,
        platformFeePercentage: 2
      }
    });
    
    await transaction.save();
    
    res.json({
      success: true,
      invoice_url: response.data.invoice_url,
      invoice_id: response.data.id,
      order_id: orderId,
      amount: amount,
      platform_fee: platformFee,
      net_amount: netAmount,
      cryptocurrency: coin
    });
    
  } catch (error) {
    console.error('❌ NOWPayments invoice creation error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to create crypto payment invoice',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// NOWPayments webhook handler
async function nowpaymentsWebhook(req, res) {
  try {
    // Verify webhook signature
    if (!verifyIPN(req)) {
      console.error('❌ Invalid NOWPayments webhook signature');
      return res.status(401).send('Invalid signature');
    }
    
    const data = JSON.parse(req.body.toString());
    console.log('🔔 NOWPayments Webhook Received:', {
      payment_id: data.payment_id,
      order_id: data.order_id,
      payment_status: data.payment_status
    });
    
    // Check if we've already processed this webhook
    const existingTransaction = await Transaction.findOne({
      'paymentDetails.payment_id': data.payment_id
    });
    
    if (existingTransaction && existingTransaction.status === 'completed') {
      console.log('⚠️ Webhook already processed, skipping');
      return res.status(200).send('OK');
    }
    
    // Find transaction by order ID
    let transaction = await Transaction.findOne({ orderId: data.order_id });
    
    if (!transaction) {
      // Try to find by invoice ID
      transaction = await Transaction.findOne({
        'paymentDetails.invoice_id': data.id
      });
    }
    
    if (!transaction) {
      console.error('❌ Transaction not found for webhook:', data.order_id);
      return res.status(404).send('Transaction not found');
    }
    
    // Update transaction based on payment status
    let transactionStatus = 'pending';
    let orderPaymentStatus = 'pending';
    
    switch (data.payment_status) {
      case 'finished':
      case 'confirmed':
        transactionStatus = 'completed';
        orderPaymentStatus = 'paid';
        
        // Update order
        const order = await Order.findOne({ orderId: transaction.orderId });
        if (order) {
          order.paymentStatus = 'paid';
          order.status = 'completed';
          order.paymentDetails = {
            gateway: 'nowpayments',
            transactionId: data.payment_id,
            paymentDate: new Date(),
            cryptoAmount: data.pay_amount,
            cryptoCurrency: data.pay_currency
          };
          await order.save();
          console.log(`✅ Order ${order.orderId} marked as paid`);
          
          // Broadcast real-time dashboard update
          const Store = require('../models/Store');
          const store = await Store.findById(order.storeId || order.store);
          if (store && store.owner) {
            // Import the broadcast function from server
            // Since we can't directly import, we'll use a helper
            try {
              const { broadcastDashboardUpdate } = require('../utils/dashboardUpdates');
              await broadcastDashboardUpdate(store.owner.toString(), store._id.toString());
              console.log('📊 Dashboard update broadcasted for NOWPayments order');
            } catch (error) {
              console.error('Error broadcasting dashboard update:', error);
            }
          }
        }
        
        // Send platform fee via Payout API
        if (process.env.AUTO_SEND_FEES === 'true') {
          await sendPlatformFee(data);
        }
        break;
        
      case 'failed':
      case 'expired':
        transactionStatus = 'failed';
        orderPaymentStatus = 'failed';
        break;
        
      case 'partially_paid':
        transactionStatus = 'partial';
        orderPaymentStatus = 'partial';
        break;
        
      default:
        transactionStatus = 'pending';
    }
    
    // Update transaction
    transaction.status = transactionStatus;
    transaction.paymentDetails = {
      ...transaction.paymentDetails,
      payment_id: data.payment_id,
      payment_status: data.payment_status,
      pay_amount: data.pay_amount,
      pay_currency: data.pay_currency,
      actually_paid: data.actually_paid,
      updated_at: new Date()
    };
    
    if (data.payment_status === 'finished') {
      transaction.completedAt = new Date();
    }
    
    await transaction.save();
    
    console.log(`✅ Transaction ${transaction._id} updated to: ${transactionStatus}`);
    
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('❌ NOWPayments webhook error:', error);
    res.status(500).send('Webhook processing error');
  }
}

// Send platform fee
async function sendPlatformFee(paymentData) {
  try {
    // Calculate 2% platform fee
    const feeAmount = parseFloat(paymentData.actually_paid) * 0.02;
    
    if (feeAmount <= 0) return;
    
    const payoutResponse = await axios.post(
      'https://api.nowpayments.io/v1/payout',
      {
        withdrawals: [
          {
            address: process.env.PLATFORM_WALLET,
            currency: paymentData.pay_currency,
            amount: feeAmount.toString()
          }
        ]
      },
      {
        headers: {
          'x-api-key': process.env.NOWPAYMENTS_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('💰 Platform fee sent:', {
      amount: feeAmount,
      currency: paymentData.pay_currency,
      payout_id: payoutResponse.data.id
    });
    
    return payoutResponse.data;
  } catch (error) {
    console.error('❌ Failed to send platform fee:', error.response?.data || error.message);
  }
}

module.exports = {
  createInvoice,
  nowpaymentsWebhook
};