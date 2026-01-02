const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Store = require('../models/Store');
const Order = require('../models/Order');
const Withdrawal = require('../models/Withdrawal');

// Get dashboard stats
router.get('/stats', auth, async (req, res) => {
  try {
    const { storeId, range = '7d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate;
    
    switch (range) {
      case '24h':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      case '1y':
        startDate = new Date(now - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }
    
    // Get store
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ 
        success: false, 
        error: 'Store not found' 
      });
    }
    
    // Check ownership
    if (store.owner.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized' 
      });
    }
    
    // Get orders in date range
    const orders = await Order.find({
      storeId,
      createdAt: { $gte: startDate },
      status: 'completed'
    });
    
    // Calculate stats
    const revenue = orders.reduce((sum, order) => sum + order.totalAmount, 0);
    const netProfit = orders.reduce((sum, order) => sum + order.storeEarnings, 0);
    const newOrders = orders.length;
    
    // Get all-time stats for comparison
    const allTimeOrders = await Order.find({ storeId, status: 'completed' });
    const previousPeriodOrders = await Order.find({
      storeId,
      createdAt: { 
        $gte: new Date(startDate.getTime() - (now - startDate)),
        $lt: startDate 
      },
      status: 'completed'
    });
    
    const previousRevenue = previousPeriodOrders.reduce((sum, order) => sum + order.totalAmount, 0);
    const previousOrders = previousPeriodOrders.length;
    
    // Calculate changes
    const revenueChange = previousRevenue > 0 
      ? ((revenue - previousRevenue) / previousRevenue) * 100 
      : 100;
    
    const ordersChange = previousOrders > 0 
      ? ((newOrders - previousOrders) / previousOrders) * 100 
      : 100;
    
    // Get customer count
    const uniqueCustomers = [...new Set(orders.map(order => order.customerEmail))].length;
    
    // Get products count
    const Product = require('../models/Product');
    const totalProducts = await Product.countDocuments({ storeId, isActive: true });
    
    // Get pending orders
    const pendingOrders = await Order.countDocuments({ 
      storeId, 
      status: 'pending' 
    });
    
    // Get withdrawal stats
    const withdrawals = await Withdrawal.find({ storeId });
    const totalWithdrawn = withdrawals
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);
    
    const pendingWithdrawals = withdrawals
      .filter(w => ['pending', 'processing', 'approved'].includes(w.status))
      .reduce((sum, w) => sum + w.amount, 0);
    
    // Calculate available balance (80% of revenue minus pending withdrawals)
    const availableBalance = Math.max(0, (store.totalRevenue * 0.8) - pendingWithdrawals);
    
    res.json({
      success: true,
      data: {
        revenue,
        netProfit,
        newOrders,
        newCustomers: uniqueCustomers,
        conversionRate: 20, // Fixed 20% as per requirement
        avgOrderValue: newOrders > 0 ? revenue / newOrders : 0,
        totalProducts,
        pendingOrders,
        visitors: Math.floor(revenue / 10), // Estimate based on revenue
        revenueChange,
        ordersChange,
        avgOrderValueChange: 0,
        totalWithdrawn,
        pendingWithdrawals,
        availableBalance
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// Get analytics data
router.get('/analytics', auth, async (req, res) => {
  try {
    const { storeId } = req.query;
    
    const store = await Store.findById(storeId);
    if (!store || store.owner.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized' 
      });
    }
    
    // Get orders
    const orders = await Order.find({ storeId });
    
    // Status analysis
    const statusAnalysis = orders.reduce((acc, order) => {
      acc[order.status] = (acc[order.status] || 0) + 1;
      return acc;
    }, {});
    
    // Payment method analysis
    const paymentAnalysis = orders.reduce((acc, order) => {
      if (order.paymentMethod) {
        acc[order.paymentMethod] = (acc[order.paymentMethod] || 0) + 1;
      }
      return acc;
    }, {});
    
    // Customer analysis
    const customerEmails = orders.map(order => order.customerEmail).filter(Boolean);
    const uniqueCustomers = [...new Set(customerEmails)];
    const repeatCustomers = customerEmails.filter((email, index, self) => 
      self.indexOf(email) !== index
    ).length;
    
    const customerAnalysis = {
      totalCustomers: uniqueCustomers.length,
      repeatCustomers,
      repeatRate: uniqueCustomers.length > 0 
        ? (repeatCustomers / uniqueCustomers.length) * 100 
        : 0,
      growth: 12.5 // Placeholder
    };
    
    // Category analysis (from products)
    const Product = require('../models/Product');
    const products = await Product.find({ storeId });
    const categoryAnalysis = products.reduce((acc, product) => {
      const category = product.category || 'Uncategorized';
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    }, {});
    
    // Top products (based on order items)
    const topProducts = products.slice(0, 5).map(product => ({
      name: product.name,
      sales: Math.floor(Math.random() * 50) + 10 // Placeholder
    }));
    
    res.json({
      success: true,
      data: {
        totalOrders: orders.length,
        statusAnalysis,
        paymentAnalysis,
        customerAnalysis,
        categoryAnalysis,
        topProducts
      }
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

// Get revenue trend
router.get('/revenue-trend', auth, async (req, res) => {
  try {
    const { storeId, range = '7d' } = req.query;
    
    const store = await Store.findById(storeId);
    if (!store || store.owner.toString() !== req.user.id) {
      return res.status(403).json({ 
        success: false, 
        error: 'Not authorized' 
      });
    }
    
    // Generate sample data for demo
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const revenueData = labels.map((label, index) => ({
      label,
      revenue: Math.floor(Math.random() * 10000) + 2000,
      orders: Math.floor(Math.random() * 50) + 10
    }));
    
    res.json({
      success: true,
      data: revenueData
    });
  } catch (error) {
    console.error('Revenue trend error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Server error' 
    });
  }
});

module.exports = router;