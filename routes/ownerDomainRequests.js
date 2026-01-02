// server/routes/ownerDomainRequests.js
const express = require('express');
const router = express.Router();
const DomainOrder = require('../models/DomainOrder');
const User = require('../models/User');
const Store = require('../models/Store');

// Middleware to verify owner
const requireOwner = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        error: 'Access denied. No token provided.' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this-in-production');
    
    const userId = decoded.userId || decoded.id || decoded.user;
    if (!userId) {
      return res.status(401).json({ 
        success: false,
        error: 'Invalid token format.' 
      });
    }
    
    const user = await User.findById(userId);
    if (!user || user.role !== 'owner') {
      return res.status(403).json({ 
        success: false,
        error: 'Owner access required' 
      });
    }
    
    // Set user in request for use in routes
    req.user = user;
    req.userId = userId;
    next();
  } catch (error) {
    console.error('Owner authentication error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Server error' 
    });
  }
};

// Get all domain requests
router.get('/domain-requests', requireOwner, async (req, res) => {
  try {
    const { status, sortBy = 'createdAt', sortOrder = 'desc', search = '' } = req.query;
    
    // Build filter
    const filter = {};
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    // Build search filter
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { domain: searchRegex },
        { 'user.name': searchRegex },
        { 'user.email': searchRegex },
        { 'store.storeName': searchRegex }
      ];
    }
    
    // Get domain orders with user and store info
    const domainOrders = await DomainOrder.find(filter)
      .populate('userId', 'name email phone subscription')
      .populate('storeId', 'storeName storeSlug createdAt')
      .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
      .lean();
    
    // Format response - handle cases where userId or storeId might be null
    const formattedOrders = domainOrders
      .filter(order => order.userId && order.storeId) // Filter out orders with missing user/store
      .map(order => ({
        _id: order._id,
        domain: order.domain,
        tld: order.tld || '.' + (order.domain?.split('.').pop() || 'com'),
        duration: order.duration || 1,
        amount: order.amount || 0,
        status: order.status || 'pending',
        notes: order.setupNotes || '',
        processedBy: order.processedBy || null,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        expiresAt: order.expiresAt,
        user: {
          _id: order.userId?._id || order.userId,
          name: order.userId?.name || 'Unknown User',
          email: order.userId?.email || 'N/A',
          phone: order.userId?.phone || 'N/A',
          subscription: order.userId?.subscription || null
        },
        store: {
          _id: order.storeId?._id || order.storeId,
          storeName: order.storeId?.storeName || 'Unknown Store',
          storeSlug: order.storeId?.storeSlug || 'N/A',
          createdAt: order.storeId?.createdAt || new Date()
        },
        payment: {
          method: 'Razorpay',
          transactionId: order.paymentId || order.orderId || 'N/A',
          paidAt: order.paidAt || order.createdAt
        }
      }));
    
    // Calculate stats
    const stats = {
      total: domainOrders.length,
      pending: domainOrders.filter(o => o.status === 'pending').length,
      processing: domainOrders.filter(o => o.status === 'processing').length,
      completed: domainOrders.filter(o => o.status === 'completed').length,
      cancelled: domainOrders.filter(o => o.status === 'cancelled').length,
      revenue: domainOrders
        .filter(o => o.status === 'completed')
        .reduce((sum, order) => sum + order.amount, 0)
    };
    
    res.json({
      success: true,
      requests: formattedOrders,
      stats,
      pagination: {
        total: formattedOrders.length,
        page: 1,
        pages: 1
      }
    });
  } catch (error) {
    console.error('Error fetching domain requests:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch domain requests' });
  }
});

// Update domain request status
router.put('/domain-requests/:id/status', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, processedBy } = req.body;
    
    const updatedOrder = await DomainOrder.findByIdAndUpdate(
      id,
      {
        status,
        setupNotes: notes,
        processedBy,
        processedAt: new Date()
      },
      { new: true }
    ).populate('userId', 'name email');
    
    if (!updatedOrder) {
      return res.status(404).json({ error: 'Domain request not found' });
    }
    
    // Send email notification if completed
    if (status === 'completed') {
      await sendDomainSetupEmail(updatedOrder.userId.email, updatedOrder.domain);
    }
    
    res.json({
      success: true,
      message: `Domain request ${status} successfully`,
      request: updatedOrder
    });
  } catch (error) {
    console.error('Error updating domain request:', error);
    res.status(500).json({ error: 'Failed to update domain request' });
  }
});

// Purchase domain (mark as processing)
router.post('/domain-requests/:id/purchase', requireOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const { purchasedBy } = req.body;
    
    const order = await DomainOrder.findById(id).populate('userId', 'email name');
    
    if (!order) {
      return res.status(404).json({ error: 'Domain request not found' });
    }
    
    // Update status to processing
    order.status = 'processing';
    order.processedBy = purchasedBy;
    order.processedAt = new Date();
    await order.save();
    
    // Here you would typically call the domain registrar API
    // For now, we'll simulate the purchase
    console.log(`Purchasing domain: ${order.domain} for user ${order.userId.email}`);
    
    res.json({
      success: true,
      message: 'Domain purchase initiated',
      request: order
    });
  } catch (error) {
    console.error('Error purchasing domain:', error);
    res.status(500).json({ error: 'Failed to purchase domain' });
  }
});

// Export domain requests
router.post('/domain-requests/export', requireOwner, async (req, res) => {
  try {
    const { format, filters } = req.body;
    
    const domainOrders = await DomainOrder.find({})
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .lean();
    
    if (format === 'csv') {
      // Convert to CSV
      const csvData = domainOrders.map(order => ({
        'Domain': order.domain,
        'User': order.userId?.name || 'N/A',
        'Email': order.userId?.email || 'N/A',
        'Store': order.storeId?.storeName || 'N/A',
        'Amount': order.amount,
        'Status': order.status,
        'Date': new Date(order.createdAt).toLocaleDateString(),
        'Processed By': order.processedBy || 'N/A',
        'Notes': order.setupNotes || ''
      }));
      
      // Convert to CSV string
      const csvHeaders = Object.keys(csvData[0] || {}).join(',');
      const csvRows = csvData.map(row => Object.values(row).join(','));
      const csvContent = [csvHeaders, ...csvRows].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=domain_requests.csv');
      res.send(csvContent);
    } else {
      // Default to JSON
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=domain_requests.json');
      res.send(JSON.stringify(domainOrders, null, 2));
    }
  } catch (error) {
    console.error('Error exporting domain requests:', error);
    res.status(500).json({ error: 'Export failed' });
  }
});

// Helper function to send email
const sendDomainSetupEmail = async (email, domain) => {
  // This is a placeholder - implement your email service here
  console.log(`Sending domain setup email to ${email} for domain ${domain}`);
  
  // Example using nodemailer (uncomment and configure)
  /*
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  
  await transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: email,
    subject: `Your domain ${domain} has been set up!`,
    html: `
      <h2>Domain Setup Complete</h2>
      <p>Your domain <strong>${domain}</strong> has been successfully set up and is now live.</p>
      <p>You can access your store at: https://${domain}</p>
      <p>Thank you for choosing our service!</p>
    `
  });
  */
};

module.exports = router;