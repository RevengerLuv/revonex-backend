// server/utils/webhookHandler.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Products');
const { sendEmail } = require('./emailService');

// Handle Stripe webhook
exports.handleStripeWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      await handleSuccessfulPayment(session);
      break;
    case 'payment_intent.payment_failed':
      const paymentIntent = event.data.object;
      await handleFailedPayment(paymentIntent);
      break;
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

async function handleSuccessfulPayment(session) {
  try {
    const order = await Order.findOne({ orderId: session.metadata.orderId });
    
    if (order) {
      order.paymentStatus = 'paid';
      order.status = 'processing';
      
      // Handle digital delivery
      if (order.deliveryType === 'digital') {
        await handleDigitalDelivery(order);
        order.deliveryStatus = 'delivered';
      }
      
      await order.save();
      
      // Send confirmation email
      await sendOrderConfirmation(order);
    }
  } catch (error) {
    console.error('Error handling successful payment:', error);
  }
}

async function handleDigitalDelivery(order) {
  // Generate download links for digital products
  for (const item of order.items) {
    const product = await Product.findById(item.product);
    if (product && product.type === 'digital' && product.digitalFile) {
      // Generate secure download token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Save download info to order
      item.digitalDownload = {
        url: `${process.env.API_URL}/download/${token}`,
        token,
        expiresAt,
        downloads: 0,
        maxDownloads: 3
      };
    }
  }
}