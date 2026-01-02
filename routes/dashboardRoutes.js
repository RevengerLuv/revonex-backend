const express = require("express");
const { auth } = require("../middleware/auth");
const Order = require("../models/Order");
const Product = require("../models/Products");
const Store = require("../models/Store");
const User = require("../models/User");

const router = express.Router();

// @route   GET /api/dashboard/stats
// @desc    Get dashboard stats for a store
router.get("/stats", auth, async (req, res) => {
  try {
    const { storeId, range = '7d' } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch(range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get orders for the store in date range
    const orders = await Order.find({
      storeId,
      createdAt: { $gte: startDate, $lte: now },
      status: { $ne: 'cancelled' }
    }).populate('items.productId');

    // Calculate stats
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get total products count
    const totalProducts = await Product.countDocuments({ storeId });

    // Get pending orders
    const pendingOrders = await Order.countDocuments({
      storeId,
      status: 'pending'
    });

    // Get unique customers
    const uniqueCustomers = new Set();
    orders.forEach(order => {
      if (order.customer?.email) {
        uniqueCustomers.add(order.customer.email);
      }
    });
    const newCustomers = uniqueCustomers.size;

    // Calculate conversion rate (simplified)
    const conversionRate = totalOrders > 0 ? Math.min((totalOrders / (totalOrders * 8)) * 100, 15) : 0;

    // Calculate net profit (assuming 20% profit margin)
    const netProfit = totalRevenue * 0.8;

    // Calculate changes (compare with previous period)
    const prevStartDate = new Date(startDate);
    const prevEndDate = new Date(startDate);

    switch(range) {
      case '24h':
        prevStartDate.setHours(prevStartDate.getHours() - 24);
        break;
      case '7d':
        prevStartDate.setDate(prevStartDate.getDate() - 7);
        break;
      case '30d':
        prevStartDate.setDate(prevStartDate.getDate() - 30);
        break;
      case '90d':
        prevStartDate.setDate(prevStartDate.getDate() - 90);
        break;
      case '1y':
        prevStartDate.setFullYear(prevStartDate.getFullYear() - 1);
        break;
    }

    const prevOrders = await Order.find({
      storeId,
      createdAt: { $gte: prevStartDate, $lte: prevEndDate },
      status: { $ne: 'cancelled' }
    });

    const prevRevenue = prevOrders.reduce((sum, order) => sum + (order.total || 0), 0);
    const prevOrdersCount = prevOrders.length;
    const prevAvgOrderValue = prevOrdersCount > 0 ? prevRevenue / prevOrdersCount : 0;

    const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0;
    const ordersChange = prevOrdersCount > 0 ? ((totalOrders - prevOrdersCount) / prevOrdersCount) * 100 : 0;
    const avgOrderValueChange = prevAvgOrderValue > 0 ? ((avgOrderValue - prevAvgOrderValue) / prevAvgOrderValue) * 100 : 0;

    // Get visitors (simplified - you might want to track this separately)
    const visitors = Math.floor(totalOrders * 12);

    res.json({
      revenue: totalRevenue,
      netProfit,
      newOrders: totalOrders,
      newCustomers,
      conversionRate,
      avgOrderValue,
      totalProducts,
      pendingOrders,
      visitors,
      revenueChange,
      ordersChange,
      avgOrderValueChange
    });

  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats'
    });
  }
});

// @route   GET /api/dashboard/analytics
// @desc    Get analytics data for dashboard
router.get("/analytics", auth, async (req, res) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Get all orders for the store
    const orders = await Order.find({
      storeId,
      status: { $ne: 'cancelled' }
    }).populate('items.productId');

    // Calculate status analysis
    const statusCounts = {};
    orders.forEach(order => {
      const status = order.status || 'pending';
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    });

    // Calculate payment method analysis
    const paymentCounts = {};
    orders.forEach(order => {
      const paymentMethod = order.paymentMethod || 'unknown';
      paymentCounts[paymentMethod] = (paymentCounts[paymentMethod] || 0) + 1;
    });

    // Calculate customer analysis
    const customerStats = {};
    orders.forEach(order => {
      const customerId = order.customer?.email || order.customer?.name || 'unknown';
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          orders: 0,
          totalSpent: 0,
          lastOrder: order.createdAt
        };
      }
      customerStats[customerId].orders += 1;
      customerStats[customerId].totalSpent += order.total || 0;
      if (order.createdAt > customerStats[customerId].lastOrder) {
        customerStats[customerId].lastOrder = order.createdAt;
      }
    });

    const totalCustomers = Object.keys(customerStats).length;
    const repeatCustomers = Object.values(customerStats).filter(c => c.orders > 1).length;
    const repeatRate = totalCustomers > 0 ? (repeatCustomers / totalCustomers) * 100 : 0;

    // Calculate category analysis
    const categoryStats = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        const category = item.productId?.category || 'General';
        categoryStats[category] = (categoryStats[category] || 0) + (item.quantity || 1);
      });
    });

    // Calculate top products
    const productStats = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          const productId = item.productId._id.toString();
          if (!productStats[productId]) {
            productStats[productId] = {
              name: item.productId.name || 'Unknown Product',
              sales: 0,
              revenue: 0
            };
          }
          productStats[productId].sales += item.quantity || 1;
          productStats[productId].revenue += (item.price || 0) * (item.quantity || 1);
        }
      });
    });

    const topProducts = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);

    res.json({
      totalOrders: orders.length,
      statusAnalysis: statusCounts,
      paymentAnalysis: paymentCounts,
      customerAnalysis: {
        totalCustomers,
        repeatCustomers,
        repeatRate,
        growth: 12.5 // You might want to calculate this based on time periods
      },
      categoryAnalysis: categoryStats,
      topProducts
    });

  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
});

// @route   GET /api/dashboard/revenue-trend
// @desc    Get revenue trend data for dashboard
router.get("/revenue-trend", auth, async (req, res) => {
  try {
    const { storeId, range = '7d' } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch(range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get orders for the store in date range
    const orders = await Order.find({
      storeId,
      createdAt: { $gte: startDate, $lte: now },
      status: { $ne: 'cancelled' }
    }).sort({ createdAt: 1 });

    // Group orders by day
    const dailyData = {};
    orders.forEach(order => {
      const date = order.createdAt.toISOString().split('T')[0];
      if (!dailyData[date]) {
        dailyData[date] = { revenue: 0, orders: 0 };
      }
      dailyData[date].revenue += order.total || 0;
      dailyData[date].orders += 1;
    });

    // Create timeline data
    const timeline = [];
    const daysDiff = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));

    for (let i = daysDiff; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];

      timeline.push({
        label: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        revenue: dailyData[dateStr]?.revenue || 0,
        orders: dailyData[dateStr]?.orders || 0
      });
    }

    res.json(timeline);

  } catch (error) {
    console.error('Error fetching revenue trend:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch revenue trend'
    });
  }
});

// @route   GET /api/dashboard/customers
// @desc    Get customer data for dashboard
router.get("/customers", auth, async (req, res) => {
  try {
    const { storeId } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Get all orders for the store
    const orders = await Order.find({
      storeId,
      status: { $ne: 'cancelled' }
    }).populate('items.productId');

    // Group orders by customer
    const customerStats = {};
    orders.forEach(order => {
      const customerId = order.customer?.email || order.customer?.name || 'unknown';
      if (!customerStats[customerId]) {
        customerStats[customerId] = {
          name: order.customer?.name || 'Unknown Customer',
          email: order.customer?.email || 'No email',
          totalOrders: 0,
          totalSpent: 0,
          lastOrder: order.createdAt,
          avgOrderValue: 0
        };
      }
      customerStats[customerId].totalOrders += 1;
      customerStats[customerId].totalSpent += order.total || 0;
      if (order.createdAt > customerStats[customerId].lastOrder) {
        customerStats[customerId].lastOrder = order.createdAt;
      }
    });

    // Calculate loyalty levels and averages
    const customers = Object.values(customerStats).map(customer => {
      customer.avgOrderValue = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;

      // Determine loyalty level
      if (customer.totalSpent > 1000) {
        customer.loyaltyLevel = 'VIP';
      } else if (customer.totalOrders > 5) {
        customer.loyaltyLevel = 'Regular';
      } else {
        customer.loyaltyLevel = 'New';
      }

      return customer;
    }).sort((a, b) => b.totalSpent - a.totalSpent); // Sort by total spent

    res.json(customers);

  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customers'
    });
  }
});

// Legacy endpoints for backward compatibility
router.get("/overview", auth, (req, res) => {
  res.json({
    revenue: 0,
    orders: 0,
    sales: 0,
  });
});

router.get("/products-performance", auth, (req, res) => {
  res.json([]);
});

// @route   GET /api/dashboard/order-analytics
// @desc    Get order analytics for dashboard
router.get("/order-analytics", auth, async (req, res) => {
  try {
    const { storeId, range = '7d', includePredictions = 'false' } = req.query;

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Calculate date range
    const now = new Date();
    const startDate = new Date();

    switch(range) {
      case '24h':
        startDate.setHours(startDate.getHours() - 24);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(startDate.getDate() - 7);
    }

    // Get orders for the store in date range
    const orders = await Order.find({
      storeId,
      createdAt: { $gte: startDate, $lte: now },
      status: { $ne: 'cancelled' }
    }).populate('items.productId').sort({ createdAt: 1 });

    // Calculate timeline data
    const timeline = [];
    const daysDiff = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));

    for (let i = daysDiff; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);

      const dayOrders = orders.filter(order =>
        order.createdAt >= date && order.createdAt < nextDate
      );

      const dayRevenue = dayOrders.reduce((sum, order) => sum + (order.total || 0), 0);
      const dayOrderCount = dayOrders.length;

      timeline.push({
        date: date.toISOString().split('T')[0],
        revenue: dayRevenue,
        orders: dayOrderCount,
        avgOrderValue: dayOrderCount > 0 ? dayRevenue / dayOrderCount : 0
      });
    }

    // Calculate summary
    const totalRevenue = orders.reduce((sum, order) => sum + (order.total || 0), 0);
    const totalOrders = orders.length;
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // Get top products
    const productStats = {};
    orders.forEach(order => {
      order.items.forEach(item => {
        if (item.productId) {
          const productId = item.productId._id.toString();
          if (!productStats[productId]) {
            productStats[productId] = {
              name: item.productId.name || 'Unknown Product',
              orders: 0,
              revenue: 0,
              quantity: 0
            };
          }
          productStats[productId].orders += 1;
          productStats[productId].revenue += (item.price || 0) * (item.quantity || 0);
          productStats[productId].quantity += item.quantity || 0;
        }
      });
    });

    const products = Object.values(productStats)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);

    // Calculate conversion rate (simplified - you might want to track actual visitors)
    const conversionRate = totalOrders > 0 ? Math.min((totalOrders / (totalOrders * 8)) * 100, 15) : 0;

    // Prepare response
    const responseData = {
      success: true,
      data: {
        summary: {
          totalRevenue,
          totalOrders,
          avgOrderValue,
          conversionRate
        },
        timeline,
        products,
        predictions: includePredictions === 'true' ? {
          nextWeekRevenue: totalRevenue * 1.1,
          nextWeekOrders: Math.ceil(totalOrders * 1.05),
          trend: 'up'
        } : null
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('Error fetching order analytics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order analytics'
    });
  }
});

router.get("/stream", auth, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const interval = setInterval(() => {
    res.write(`data: ${JSON.stringify({ ping: Date.now() })}\n\n`);
  }, 5000);

  req.on("close", () => {
    clearInterval(interval);
    res.end();
  });
});

module.exports = router;
