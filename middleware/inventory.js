// server/middleware/inventory.js
const InventoryService = require('../services/inventoryService');

/**
 * Middleware to check inventory before processing payment
 */
const checkInventory = async (req, res, next) => {
  try {
    const { items } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return next();
    }
    
    // Check inventory for each product
    const inventoryChecks = await Promise.all(
      items.map(async item => {
        const check = await InventoryService.checkInventoryAvailability(
          item.productId,
          item.quantity || 1
        );
        return { ...check, productId: item.productId };
      })
    );
    
    // Check if any product is out of stock
    const outOfStock = inventoryChecks.filter(check => 
      !check.available && check.reason !== 'NO_INVENTORY_REQUIRED'
    );
    
    if (outOfStock.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'OUT_OF_STOCK',
        products: outOfStock.map(p => ({
          productId: p.productId,
          productName: p.productName,
          available: p.availableCount,
          required: p.required
        }))
      });
    }
    
    // Attach inventory check results to request
    req.inventoryChecks = inventoryChecks;
    next();
    
  } catch (error) {
    console.error('Inventory check error:', error);
    res.status(500).json({
      success: false,
      error: 'INVENTORY_CHECK_FAILED'
    });
  }
};

/**
 * Middleware to reserve inventory after payment initiation
 */
const reserveInventory = async (req, res, next) => {
  try {
    const { orderId, items, customer } = req.body;
    
    if (!orderId || !items || !customer) {
      return next();
    }
    
    const reservations = [];
    
    // Reserve inventory for each product that requires it
    for (const item of items) {
      const check = await InventoryService.checkInventoryAvailability(
        item.productId,
        item.quantity || 1
      );
      
      // Only reserve if product has inventory system
      if (check.reason !== 'NO_INVENTORY_REQUIRED' && check.available) {
        // For now, reserve one at a time (support for quantity > 1 can be added)
        for (let i = 0; i < (item.quantity || 1); i++) {
          try {
            const reservation = await InventoryService.reserveInventory(
              item.productId,
              orderId,
              customer.email
            );
            reservations.push(reservation);
          } catch (reserveError) {
            // Release any already reserved items
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
    
    // Store reservations in request for later use
    req.inventoryReservations = reservations;
    next();
    
  } catch (error) {
    console.error('Reserve inventory error:', error);
    res.status(500).json({
      success: false,
      error: 'INVENTORY_RESERVATION_FAILED',
      message: error.message
    });
  }
};

/**
 * Middleware to confirm inventory after successful payment
 */
const confirmInventory = async (req, res, next) => {
  try {
    const { orderId, inventoryReservations } = req;
    
    if (!inventoryReservations || inventoryReservations.length === 0) {
      return next();
    }
    
    const confirmations = [];
    
    // Confirm each reserved inventory item
    for (const reservation of inventoryReservations) {
      try {
        const confirmation = await InventoryService.confirmInventory(
          reservation.productId,
          orderId,
          reservation.inventoryItemId
        );
        confirmations.push(confirmation);
      } catch (confirmError) {
        console.error('Confirm inventory error:', confirmError);
        // Continue with other items even if one fails
      }
    }
    
    req.inventoryConfirmations = confirmations;
    next();
    
  } catch (error) {
    console.error('Confirm inventory middleware error:', error);
    // Don't fail the whole request if inventory confirmation fails
    next();
  }
};

/**
 * Middleware to release inventory on payment failure
 */
const releaseInventoryOnFailure = async (req, res, next) => {
  try {
    const { orderId, inventoryReservations } = req;
    
    if (!inventoryReservations || inventoryReservations.length === 0) {
      return next();
    }
    
    // Release all reserved items
    await Promise.all(
      inventoryReservations.map(reservation =>
        InventoryService.releaseInventory(
          reservation.productId,
          orderId,
          reservation.inventoryItemId
        ).catch(() => {})
      )
    );
    
    next();
  } catch (error) {
    console.error('Release inventory error:', error);
    next();
  }
};

module.exports = {
  checkInventory,
  reserveInventory,
  confirmInventory,
  releaseInventoryOnFailure
};