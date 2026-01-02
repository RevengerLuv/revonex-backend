// server/services/inventoryService.js
const mongoose = require('mongoose');

class InventoryService {
  /**
   * Reserve inventory for an order (atomic operation)
   * Uses MongoDB transactions to prevent race conditions
   */
  static async reserveInventory(productId, orderId, customerEmail) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const Product = mongoose.model('Product');
      
      // Find product with available inventory
      const product = await Product.findOne({
        _id: productId,
        'inventory.items.status': 'available'
      }).session(session);
      
      if (!product) {
        throw new Error('NO_INVENTORY_AVAILABLE');
      }
      
      if (product.inventory.type === 'none') {
        throw new Error('PRODUCT_HAS_NO_INVENTORY');
      }
      
      // Find first available inventory item
      const itemIndex = product.inventory.items.findIndex(
        item => item.status === 'available'
      );
      
      if (itemIndex === -1) {
        throw new Error('INVENTORY_EXHAUSTED');
      }
      
      // Reserve the item
      const reservedItem = product.inventory.items[itemIndex];
      reservedItem.status = 'reserved';
      reservedItem.orderId = orderId;
      reservedItem.customerEmail = customerEmail;
      reservedItem.reservedAt = new Date();
      
      // Update inventory counts
      product.inventory.stockCount = product.inventory.items.filter(
        item => item.status === 'available'
      ).length;
      
      // Calculate reserved count
      const reservedCount = product.inventory.items.filter(
        item => item.status === 'reserved'
      ).length;
      
      // Store reserved count if field exists, or track separately
      if (product.inventory.reservedCount !== undefined) {
        product.inventory.reservedCount = reservedCount;
      }
      
      await product.save({ session });
      await session.commitTransaction();
      
      return {
        success: true,
        inventoryItemId: reservedItem._id,
        details: reservedItem.details,
        productId: product._id,
        productName: product.name
      };
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Reserve inventory error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Confirm inventory assignment (after successful payment)
   */
  static async confirmInventory(productId, orderId, inventoryItemId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const Product = mongoose.model('Product');
      const Order = mongoose.model('Order');
      
      // Find and update product inventory
      const product = await Product.findOne({
        _id: productId,
        'inventory.items._id': inventoryItemId,
        'inventory.items.orderId': orderId,
        'inventory.items.status': 'reserved'
      }).session(session);
      
      if (!product) {
        throw new Error('INVENTORY_NOT_FOUND_OR_NOT_RESERVED');
      }
      
      const item = product.inventory.items.id(inventoryItemId);
      if (!item) {
        throw new Error('INVENTORY_ITEM_NOT_FOUND');
      }
      
      // Mark as sold
      item.status = 'sold';
      item.soldAt = new Date();
      
      // Update inventory counts
      product.inventory.soldCount += 1;
      product.inventory.stockCount = product.inventory.items.filter(
        item => item.status === 'available'
      ).length;
      
      // Update reserved count if field exists
      if (product.inventory.reservedCount !== undefined) {
        product.inventory.reservedCount = product.inventory.items.filter(
          item => item.status === 'reserved'
        ).length;
      }
      
      await product.save({ session });
      
      // Update order with inventory details
      const order = await Order.findOne({ orderId }).session(session);
      if (order) {
        // Add inventory details to order items
        order.items.forEach(item => {
          if (item.productId.toString() === productId.toString()) {
            item.inventoryAssigned = true;
            item.inventoryItemId = inventoryItemId;
            item.deliveryDetails = {
              credentials: item.details,
              deliveredAt: new Date(),
              deliveryMethod: 'instant'
            };
          }
        });
        
        order.updatedAt = new Date();
        await order.save({ session });
      }
      
      await session.commitTransaction();
      
      return {
        success: true,
        inventoryDetails: item.details,
        orderId,
        productId,
        productName: product.name
      };
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Confirm inventory error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Release reserved inventory (if payment fails)
   */
  static async releaseInventory(productId, orderId, inventoryItemId) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const Product = mongoose.model('Product');
      
      const product = await Product.findOne({
        _id: productId,
        'inventory.items._id': inventoryItemId,
        'inventory.items.orderId': orderId,
        'inventory.items.status': 'reserved'
      }).session(session);
      
      if (!product) {
        // Item might already be released or never reserved
        await session.commitTransaction();
        return { success: true, message: 'Inventory already released or not found' };
      }
      
      const item = product.inventory.items.id(inventoryItemId);
      item.status = 'available';
      item.orderId = null;
      item.customerEmail = null;
      item.reservedAt = null;
      
      // Update inventory counts
      product.inventory.stockCount = product.inventory.items.filter(
        item => item.status === 'available'
      ).length;
      
      if (product.inventory.reservedCount !== undefined) {
        product.inventory.reservedCount = product.inventory.items.filter(
          item => item.status === 'reserved'
        ).length;
      }
      
      await product.save({ session });
      await session.commitTransaction();
      
      return { success: true, message: 'Inventory released successfully' };
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Release inventory error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
  
  /**
   * Check if product has available inventory
   */
  static async checkInventoryAvailability(productId, quantity = 1) {
    try {
      const Product = mongoose.model('Product');
      
      const product = await Product.findById(productId).select('inventory name');
      
      if (!product) {
        return { available: false, reason: 'PRODUCT_NOT_FOUND' };
      }
      
      if (product.inventory.type === 'none') {
        return { available: true, reason: 'NO_INVENTORY_REQUIRED' };
      }
      
      const availableCount = product.inventory.items.filter(
        item => item.status === 'available'
      ).length;
      
      const canPurchase = availableCount >= quantity;
      
      return {
        available: canPurchase,
        availableCount,
        required: quantity,
        productName: product.name,
        productId: product._id
      };
      
    } catch (error) {
      console.error('Check inventory error:', error);
      return { available: false, reason: 'ERROR_CHECKING_INVENTORY' };
    }
  }
  
  /**
   * Get inventory details for order delivery
   */
  static async getDeliveryDetails(orderId, productId) {
    try {
      const Product = mongoose.model('Product');
      const Order = mongoose.model('Order');
      
      const order = await Order.findOne({ orderId });
      if (!order) {
        throw new Error('ORDER_NOT_FOUND');
      }
      
      const product = await Product.findById(productId);
      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }
      
      // Find the sold inventory item for this order
      const soldItem = product.inventory.items.find(
        item => item.orderId === orderId && item.status === 'sold'
      );
      
      if (!soldItem) {
        throw new Error('INVENTORY_NOT_DELIVERED_YET');
      }
      
      // Parse credentials from details string
      const credentials = this.parseCredentials(soldItem.details);
      
      return {
        success: true,
        orderId,
        productId,
        productName: product.name,
        credentials,
        deliveryDate: soldItem.soldAt,
        inventoryItemId: soldItem._id
      };
      
    } catch (error) {
      console.error('Get delivery details error:', error);
      throw error;
    }
  }
  
  /**
   * Parse credentials from details string
   */
  static parseCredentials(details) {
    try {
      const credentials = {};
      const pairs = details.split('|');
      
      pairs.forEach(pair => {
        const [key, value] = pair.split(':').map(str => str.trim());
        if (key && value) {
          credentials[key] = value;
        }
      });
      
      return credentials;
    } catch (error) {
      // Return raw details if parsing fails
      return { raw: details };
    }
  }
  
  /**
   * Add inventory items to product (bulk)
   */
  static async addInventoryItems(productId, items) {
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      const Product = mongoose.model('Product');
      
      const product = await Product.findById(productId).session(session);
      if (!product) {
        throw new Error('PRODUCT_NOT_FOUND');
      }
      
      if (product.inventory.type === 'none') {
        throw new Error('PRODUCT_NOT_CONFIGURED_FOR_INVENTORY');
      }
      
      const inventoryItems = items.map(item => ({
        details: item.details,
        notes: item.notes || '',
        status: 'available',
        createdAt: new Date()
      }));
      
      product.inventory.items.push(...inventoryItems);
      product.inventory.stockCount = product.inventory.items.filter(
        item => item.status === 'available'
      ).length;
      
      await product.save({ session });
      await session.commitTransaction();
      
      return {
        success: true,
        addedCount: items.length,
        totalStock: product.inventory.stockCount,
        productName: product.name
      };
      
    } catch (error) {
      await session.abortTransaction();
      console.error('Add inventory error:', error);
      throw error;
    } finally {
      session.endSession();
    }
  }
}

module.exports = InventoryService;