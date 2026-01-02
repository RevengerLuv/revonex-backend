// server/routes/orderRoutes.js
const express = require('express');
const router = express.Router();
const orderController = require('../controllers/orderController');
const auth = require('../middleware/auth');
const InventoryService = require('../services/inventoryService');

// Get delivery details for an order
router.get('/:orderId/deliver', auth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const userId = req.userId;
    
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
    
    // Get delivery details using InventoryService
    const deliveryDetails = [];
    
    for (const item of order.items) {
      if (item.inventoryAssigned && item.inventoryItemId) {
        try {
          const details = await InventoryService.getDeliveryDetails(
            order.orderId,
            item.productId
          );
          
          if (details.success) {
            deliveryDetails.push({
              productId: item.productId,
              productName: item.name || details.productName,
              credentials: details.credentials,
              deliveredAt: details.deliveryDate,
              deliveryMethod: 'instant'
            });
          }
        } catch (error) {
          console.error(`Error getting delivery for ${item.productId}:`, error);
        }
      }
    }
    
    res.json({
      success: true,
      orderId,
      deliveryDetails,
      hasCredentials: deliveryDetails.length > 0
    });
    
  } catch (error) {
    console.error('Get delivery error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;