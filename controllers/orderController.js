const Order = require('../models/Order');
const Product = require('../models/Products');
const Store = require('../models/Store');
const User = require('../models/User');
// Create a new order
exports.createOrder = async (req, res) => {
  try {
    const { storeId, items, customer, total, currency = 'INR', deliveryType = 'digital' } = req.body;
    
    // Validate store exists
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({ success: false, error: 'Store not found' });
    }
    
    // Validate products
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          error: `Product ${item.name} not found` 
        });
      }
      
      // Check stock for physical products
      if (product.type === 'physical' && product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          error: `Insufficient stock for ${item.name}. Available: ${product.stock}`
        });
      }
    }
    
    // Generate unique order ID
    const orderId = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    
    // Create order
    const order = new Order({
      orderId,
      store: storeId,
      storeId: storeId,
      items,
      customer: {
        name: customer.name,
        email: customer.email,
        phone: customer.phone || ''
      },
      total,
      currency,
      deliveryType,
      status: 'pending',
      paymentStatus: 'pending',
      createdAt: new Date()
    });
    
    await order.save();
    
    // Update product stock for physical products
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (product.type === 'physical') {
        product.stock -= item.quantity;
        product.salesCount = (product.salesCount || 0) + item.quantity;
        product.revenue = (product.revenue || 0) + (item.price * item.quantity);
        await product.save();
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: order
    });
    
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create order' 
    });
  }
};

// Get all orders for a store
exports.getStoreOrders = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { status, limit = 50, page = 1 } = req.query;
    
    const filter = { store: storeId };
    if (status) filter.status = status;
    
    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    
    const total = await Order.countDocuments(filter);
    
    res.json({
      success: true,
      data: orders,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    });
    
  } catch (error) {
    console.error('Get store orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders' 
    });
  }
};

// Get order by ID
exports.getOrderById = async (req, res) => {
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
      const store = await Store.findById(order.store);
      if (store.owner.toString() !== req.userId) {
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
};

// Update order status
exports.updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, deliveryStatus, notes } = req.body;
    
    const order = await Order.findOne({ orderId });
    
    if (!order) {
      return res.status(404).json({ 
        success: false, 
        error: 'Order not found' 
      });
    }
    
    // Check if user has access to this order
    if (req.userRole !== 'admin') {
      const store = await Store.findById(order.store);
      if (store.owner.toString() !== req.userId) {
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied' 
        });
      }
    }
    
    const updates = {};
    if (status) {
      updates.status = status;
      // If status is cancelled, restore stock for physical products
      if (status === 'cancelled' && order.status !== 'cancelled') {
        for (const item of order.items) {
          const product = await Product.findById(item.productId);
          if (product && product.type === 'physical') {
            product.stock += item.quantity;
            product.salesCount = Math.max(0, (product.salesCount || 0) - item.quantity);
            product.revenue = Math.max(0, (product.revenue || 0) - (item.price * item.quantity));
            await product.save();
          }
        }
      }
    }
    if (deliveryStatus) updates.deliveryStatus = deliveryStatus;
    if (notes) updates.notes = notes;
    updates.updatedAt = new Date();
    
    const updatedOrder = await Order.findOneAndUpdate(
      { orderId },
      { $set: updates },
      { new: true }
    );
    
    res.json({
      success: true,
      message: 'Order updated successfully',
      data: updatedOrder
    });
    
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to update order' 
    });
  }
};

// Delete order (admin/store owner only)
exports.deleteOrder = async (req, res) => {
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
      const store = await Store.findById(order.store);
      if (store.owner.toString() !== req.userId) {
        return res.status(403).json({ 
          success: false, 
          error: 'Access denied' 
        });
      }
    }
    
    await Order.deleteOne({ orderId });
    
    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
    
  } catch (error) {
    console.error('Delete order error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete order' 
    });
  }
};

// Get customer orders
exports.getCustomerOrders = async (req, res) => {
  try {
    const customerEmail = req.userEmail || req.query.email;
    
    if (!customerEmail) {
      return res.status(400).json({ 
        success: false, 
        error: 'Customer email is required' 
      });
    }
    
    const orders = await Order.find({ 'customer.email': customerEmail })
      .sort({ createdAt: -1 })
      .populate('store', 'storeName storeSlug');
    
    res.json({
      success: true,
      data: orders
    });
    
  } catch (error) {
    console.error('Get customer orders error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch orders' 
    });
  }
};