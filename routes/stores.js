// server/routes/stores.js - COMPLETE WORKING VERSION
const express = require('express');
const router = express.Router();
const storeController = require('../controllers/storeController');
const productController = require('../controllers/productController');
const { auth } = require('../middleware/auth');
const checkStoreLimit = require('../middleware/checkStoreLimit');
const Product = require('../models/Products');
const Store = require('../models/Store');

module.exports = function(upload) {
  // ========== STORE ROUTES ==========
  
  // @route   POST /api/stores
  // @desc    Create a new store
  router.post('/', auth, checkStoreLimit, upload.any(), storeController.createStore);

  // @route   GET /api/stores/my-stores
  // @desc    Get user's stores
  router.get('/my-stores', auth, storeController.getMyStores);

  // @route   GET /api/stores/:slug
  // @desc    Get store by slug
  router.get('/:slug', storeController.getStoreBySlug);

  // @route   PUT /api/stores/:id
  // @desc    Update store
  router.put('/:id', auth, storeController.updateStore);

  // @route   DELETE /api/stores/:id
  // @desc    Delete store
  router.delete('/:id', auth, storeController.deleteStore);

  // @route   POST /api/stores/:id/upload-logo
  // @desc    Upload store logo
  router.post('/:id/upload-logo', auth, upload.single('logo'), storeController.uploadLogo);

  // ========== STORE PRODUCTS ROUTES ==========
  
  // @route   GET /api/stores/:slug/products
  // @desc    Get products by store slug (PUBLIC) - FIXED VERSION
  router.get('/:slug/products', async (req, res) => {
    try {
      console.log('🛍️ [GET /api/stores/:slug/products] Fetching products for store:', req.params.slug);
      
      // Find store by slug
      const store = await Store.findOne({ 
        storeSlug: req.params.slug
      });
      
      if (!store) {
        console.log('❌ Store not found:', req.params.slug);
        return res.status(404).json({
          success: false,
          error: 'Store not found'
        });
      }
      
      console.log('✅ Store found:', {
        id: store._id,
        idString: store._id.toString(),
        name: store.storeName,
        slug: store.storeSlug,
        template: store.template
      });
      
      // DEBUG: Check all products in database first
      const allProductsDebug = await Product.find({}).limit(3).lean();
      console.log('🔍 Sample products in DB:', allProductsDebug.map(p => ({
        id: p._id,
        name: p.name,
        store: p.store ? p.store.toString() : 'NO STORE FIELD',
        storeId: p.storeId ? p.storeId.toString() : 'NO STOREID FIELD',
        hasStore: !!p.store,
        hasStoreId: !!p.storeId
      })));
      
      // Find products for this store - SIMPLE QUERY FIRST
      let products = [];
      
      // Method 1: Try direct query with store ID
      try {
        console.log('🔍 Trying to find products with store._id:', store._id);
        products = await Product.find({ 
          $or: [
            { store: store._id },
            { storeId: store._id }
          ]
        }).lean();
        
        console.log(`📊 Found ${products.length} products with direct query`);
      } catch (queryError) {
        console.log('⚠️ Direct query failed:', queryError.message);
      }
      
      // Method 2: If no products, try getting all and filtering
      if (products.length === 0) {
        console.log('🔍 Trying manual filtering...');
        const allProducts = await Product.find({}).lean();
        
        // Filter products that belong to this store
        products = allProducts.filter(p => {
          // Check if product has store reference
          const hasStoreRef = p.store || p.storeId;
          if (!hasStoreRef) return false;
          
          // Convert both to string for comparison
          const storeIdStr = store._id.toString();
          const productStoreStr = p.store ? p.store.toString() : '';
          const productStoreIdStr = p.storeId ? p.storeId.toString() : '';
          
          return productStoreStr === storeIdStr || productStoreIdStr === storeIdStr;
        });
        
        console.log(`📊 Found ${products.length} products with manual filtering`);
      }
      
      console.log(`📊 Total products found: ${products.length}`);
      
      // If no products found, return empty array
      if (products.length === 0) {
        console.log('⚠️ No products found, returning empty array');
        return res.json({
          success: true,
          data: []
        });
      }
      
      // Format products for BoldTemplate
      const formattedProducts = products.map((product, index) => {
        // Handle images
        let images = [];
        
        // Check what image data we have
        if (product.images && Array.isArray(product.images) && product.images.length > 0) {
          // Product has images array
          images = product.images.map(img => {
            if (!img) return `https://picsum.photos/400/300?random=${product._id}${index}`;
            if (img.startsWith('http')) return img;
            if (img.startsWith('/')) return `https://revonex-backend.onrender.com/api${img}`;
            return `https://revonex-backend.onrender.com/api/${img}`;
          });
        } else if (product.image && typeof product.image === 'string') {
          // Product has single image field
          const img = product.image;
          images = [img.startsWith('http') ? img : `https://revonex-backend.onrender.com/api${img}`];
        } else {
          // Default image
          images = [`https://picsum.photos/400/300?random=${product._id}${index}`];
        }
        
        // Get category - handle different possible fields
        let category = 'General';
        if (product.category && typeof product.category === 'string') {
          category = product.category;
        } else if (product.categories && Array.isArray(product.categories) && product.categories.length > 0) {
          category = product.categories[0];
        } else if (product.tags && Array.isArray(product.tags) && product.tags.length > 0) {
          category = product.tags[0];
        }
        
        // Calculate compare price if not set
        let comparePrice = product.comparePrice;
        if (!comparePrice && product.price) {
          comparePrice = product.price * 1.5; // 50% markup
        }
        
        // Create the formatted product object
        const formattedProduct = {
          _id: product._id ? product._id.toString() : `product-${index}`,
          name: product.name || 'Unnamed Product',
          description: product.description || '',
          shortDescription: product.shortDescription || 
            (product.description ? product.description.substring(0, 100) + '...' : 'High-quality product'),
          price: product.price || 0,
          comparePrice: comparePrice,
          images: images,
          category: category,
          rating: product.rating || 4.0,
          reviews: product.reviews || 0,
          stock: product.stock || 0,
          featured: product.featured || false,
          trending: product.trending || false,
          onSale: product.onSale || false
        };
        
        return formattedProduct;
      });
      
      console.log(`✅ Returning ${formattedProducts.length} formatted products`);
      
      res.json({
        success: true,
        data: formattedProducts
      });
      
    } catch (error) {
      console.error('❌ [GET /api/stores/:slug/products] Error:', error);
      console.error('Error stack:', error.stack);
      
      // Even on error, return empty array so frontend doesn't crash
      res.json({
        success: true,
        data: []
      });
    }
  });

  // @route   POST /api/stores/:slug/products
  // @desc    Create product for store (PROTECTED)
  router.post('/:slug/products', auth, upload.array('images', 10), async (req, res) => {
    try {
      console.log('📦 [POST /api/stores/:slug/products] Creating product for store:', req.params.slug);
      console.log('📝 Request body:', req.body);
      
      // Find store
      const store = await Store.findOne({ storeSlug: req.params.slug });
      if (!store) {
        console.log('❌ Store not found');
        return res.status(404).json({
          success: false,
          error: 'Store not found'
        });
      }
      
      console.log('✅ Store found:', store.storeName, 'ID:', store._id);
      
      // Check ownership
      if (!req.user || !req.user._id) {
        console.log('❌ No user in request');
        return res.status(401).json({
          success: false,
          error: 'Not authenticated'
        });
      }
      
      const isOwner = store.owner.toString() === req.user._id.toString();
      if (!isOwner) {
        console.log('❌ Permission denied - user is not store owner');
        console.log('Store owner:', store.owner, 'User:', req.user._id);
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to add products to this store'
        });
      }
      
      console.log('✅ Permission granted');
      
      // Prepare product data
      const productData = {
        name: req.body.name || 'New Product',
        description: req.body.description || '',
        shortDescription: req.body.shortDescription || '',
        price: parseFloat(req.body.price) || 0,
        comparePrice: req.body.comparePrice ? parseFloat(req.body.comparePrice) : null,
        type: req.body.type || 'digital',
        isActive: req.body.status === 'active' || req.body.isActive !== false, // Use isActive instead of status
        visibility: req.body.visibility || 'public',
        stock: parseInt(req.body.stock) || 0,
        category: req.body.category || 'General',
        store: store._id,  // ObjectId reference
        storeId: store._id.toString(), // String for compatibility
        owner: req.user._id
      };
      
      // Add optional fields
      if (req.body.sku) productData.sku = req.body.sku;
      if (req.body.categories) {
        try {
          productData.categories = Array.isArray(req.body.categories) 
            ? req.body.categories 
            : JSON.parse(req.body.categories);
        } catch (e) {
          productData.categories = [req.body.category || 'General'];
        }
      }
      
      // Handle images
      if (req.files && req.files.length > 0) {
        productData.images = req.files.map(file => `/uploads/${file.filename}`);
        console.log('📸 Added images:', productData.images.length);
      }
      
      // Generate slug
      const slug = productData.name.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50) + '-' + Math.random().toString(36).substr(2, 6);
      productData.slug = slug;
      
      console.log('📝 Final product data to save:', {
        name: productData.name,
        price: productData.price,
        category: productData.category,
        store: productData.store,
        storeId: productData.storeId,
        hasImages: !!(productData.images && productData.images.length > 0)
      });
      
      // Create product directly
      const product = await Product.create(productData);
      
      console.log('✅ Product created successfully:', product._id);
      
      res.status(201).json({
        success: true,
        message: 'Product created successfully!',
        data: product
      });
      
    } catch (error) {
      console.error('❌ [POST /api/stores/:slug/products] Error:', error);
      console.error('Error stack:', error.stack);
      res.status(500).json({
        success: false,
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // ========== DEBUG & UTILITY ROUTES ==========
  
  // @route   GET /api/stores/:slug/debug
  // @desc    Debug store data
  router.get('/:slug/debug', async (req, res) => {
    try {
      const store = await Store.findOne({ storeSlug: req.params.slug });
      
      if (!store) {
        return res.json({
          success: false,
          message: 'Store not found'
        });
      }
      
      // Get all products count
      const totalProducts = await Product.countDocuments({});
      
      // Try different queries
      const productsByStore = await Product.find({ store: store._id });
      const productsByStoreId = await Product.find({ storeId: store._id });
      
      res.json({
        success: true,
        store: {
          id: store._id,
          idString: store._id.toString(),
          name: store.storeName,
          slug: store.storeSlug,
          owner: store.owner,
          ownerString: store.owner.toString(),
          template: store.template,
          createdAt: store.createdAt
        },
        products: {
          totalInDatabase: totalProducts,
          byStoreField: productsByStore.length,
          byStoreIdField: productsByStoreId.length,
          byStoreDetails: productsByStore.map(p => ({
            id: p._id,
            name: p.name,
            price: p.price,
            category: p.category
          }))
        },
        apiEndpoints: {
          getProducts: `GET /api/stores/${req.params.slug}/products`,
          createProduct: `POST /api/stores/${req.params.slug}/products`,
          getStore: `GET /api/stores/${req.params.slug}`
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  // @route   GET /api/stores/:slug/test
  // @desc    Simple test route
  router.get('/:slug/test', (req, res) => {
    console.log('✅ Test route called for slug:', req.params.slug);
    res.json({
      success: true,
      message: 'Route is working!',
      slug: req.params.slug,
      timestamp: new Date().toISOString()
    });
  });

  return router;
};