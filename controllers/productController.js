const Product = require('../models/Products');
const Store = require('../models/Store');
const mongoose = require('mongoose');

// Temporary slugify function for testing
const slugify = (text, options = {}) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
};

// Helper function to get current product count for user
const getCurrentProductCount = async (userId) => {
  // Get all stores owned by the user
  const userStores = await Store.find({
    owner: userId,
    isActive: true,
    isBanned: { $ne: true }
  }).select('_id');

  const storeIds = userStores.map(store => store._id);

  if (storeIds.length === 0) {
    return 0;
  }

  // Count products across all user's stores
  const existingProductsCount = await Product.countDocuments({
    store: { $in: storeIds },
    $or: [
      { status: { $exists: false }, isActive: true },
      { status: { $exists: true }, status: { $ne: 'archived' }, isActive: true }
    ]
  });

  return existingProductsCount;
};

// Helper function to get plan limit
const getPlanLimit = (plan) => {
  const planLimits = {
    free: 18,
    starter: 30,
    pro: 50,
    enterprise: 1000
  };
  
  return planLimits[plan || 'free'] || 18;
};

// Check subscription limits
const checkSubscriptionLimits = async (req, res, next) => {
  try {
    console.log('🔍 Checking subscription limits for user:', req.user._id);
    // Check if user has an active subscription
    let userPlan = 'free';
    if (req.user) {
      // First try direct subscription access
      let subscription = req.user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (req.user.user?.subscription) {
          subscription = req.user.user.subscription;
        } else if (req.user.profile?.subscription) {
          subscription = req.user.profile.subscription;
        } else if (req.user.data?.subscription) {
          subscription = req.user.data.subscription;
        } else if (req.user._doc?.subscription) { // Check mongoose document structure
          subscription = req.user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          userPlan = subscription.plan;
        }
      }
    }

    console.log('📊 User subscription:', JSON.stringify(subscription, null, 2));
    console.log('📋 User plan:', userPlan);
    
    const maxProducts = getPlanLimit(userPlan);
    console.log('🎯 Max products allowed:', maxProducts);

    // Get current product count
    const existingProductsCount = await getCurrentProductCount(req.user._id);
    console.log('📦 Current product count:', existingProductsCount);
    
    // Check if user can create more products
    if (existingProductsCount >= maxProducts) {
      console.log('🚫 Product limit reached! Please Upgrade To Starter Plan');
      return res.status(400).json({
        success: false,
        error: `Product creation limit reached! Please upgrade to Starter Plan to create more products.`,
        limitReached: true,
        currentCount: existingProductsCount,
        maxLimit: maxProducts,
        plan: userPlan,
        message: `Your ${userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} plan allows up to ${maxProducts} total products across all stores. Please upgrade your plan to create more products.`
      });
    }

    console.log('✅ Product creation allowed. Remaining:', maxProducts - existingProductsCount);
    
    // Add limit info to request for use in controller
    req.productLimits = {
      current: existingProductsCount,
      max: maxProducts,
      remaining: maxProducts - existingProductsCount,
      plan: userPlan,
      canCreate: existingProductsCount < maxProducts
    };

    next();
  } catch (error) {
    console.error('❌ Error checking subscription limits:', error);
    next(error);
  }
};

// Create product
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      description,
      shortDescription,
      price,
      comparePrice,
      cost,
      sku,
      barcode,
      variants,
      categories,
      tags,
      type,
      status,
      visibility,
      stock,
      lowStockThreshold,
      weight,
      dimensions,
      seoTitle,
      seoDescription,
      seoKeywords,
      customFields,
      storeId,
      inventoryType,
      inventoryItems
    } = req.body;

    // Validate required fields
    if (!name || !price) {
      return res.status(400).json({
        success: false,
        error: 'Product name and price are required'
      });
    }

    if (!storeId) {
      return res.status(400).json({
        success: false,
        error: 'Store ID is required'
      });
    }

    // Check if user has access to the store
    const store = await Store.findById(storeId);
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Check ownership
    const isOwner = store.owner.toString() === req.user._id.toString();
    const isMember = store.members && store.members.some(member => 
      member.user.toString() === req.user._id.toString() && 
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to add products to this store'
      });
    }

    // Check subscription limits
    // Check if user has an active subscription
    let userPlan = 'free';
    if (req.user) {
      // First try direct subscription access
      let subscription = req.user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (req.user.user?.subscription) {
          subscription = req.user.user.subscription;
        } else if (req.user.profile?.subscription) {
          subscription = req.user.profile.subscription;
        } else if (req.user.data?.subscription) {
          subscription = req.user.data.subscription;
        } else if (req.user._doc?.subscription) { // Check mongoose document structure
          subscription = req.user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          userPlan = subscription.plan;
        }
      }
    }

    const maxProducts = getPlanLimit(userPlan);
    const existingProductsCount = await getCurrentProductCount(req.user._id);

    if (existingProductsCount >= maxProducts) {
      return res.status(400).json({
        success: false,
        error: `Product creation limit reached! Please upgrade to Starter Plan to create more products.`,
        limitReached: true,
        currentCount: existingProductsCount,
        maxLimit: maxProducts,
        plan: userPlan,
        message: `Your ${userPlan.charAt(0).toUpperCase() + userPlan.slice(1)} plan allows up to ${maxProducts} total products across all stores. Please upgrade your plan to create more products.`
      });
    }

    // Generate slug
    const slug = slugify(name, {
      lower: true,
      strict: true,
      trim: true
    });

    // Check if slug exists in same store
    const existingProduct = await Product.findOne({ slug, store: storeId });
    let finalSlug = slug;
    
    if (existingProduct) {
      // Add timestamp to make slug unique
      finalSlug = `${slug}-${Date.now().toString().slice(-6)}`;
    }

    // Parse JSON fields
    let parsedVariants = [];
    if (variants) {
      try {
        parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : variants;
      } catch (e) {
        console.error('Error parsing variants:', e);
      }
    }

    let parsedCategories = [];
    if (categories) {
      try {
        parsedCategories = typeof categories === 'string' ? JSON.parse(categories) : categories;
      } catch (e) {
        console.error('Error parsing categories:', e);
        // Ensure it's an array
        parsedCategories = [];
      }
    }

    let parsedTags = [];
    if (tags) {
      try {
        parsedTags = typeof tags === 'string' ? JSON.parse(tags) : tags;
      } catch (e) {
        console.error('Error parsing tags:', e);
        parsedTags = [];
      }
    }

    let parsedDimensions = {};
    if (dimensions) {
      try {
        parsedDimensions = typeof dimensions === 'string' ? JSON.parse(dimensions) : dimensions;
      } catch (e) {
        console.error('Error parsing dimensions:', e);
      }
    }

    let parsedCustomFields = [];
    if (customFields) {
      try {
        parsedCustomFields = typeof customFields === 'string' ? JSON.parse(customFields) : customFields;
      } catch (e) {
        console.error('Error parsing custom fields:', e);
      }
    }

    // Handle inventory items for manual inventory
    let inventoryData = {
      type: inventoryType || 'none',
      items: [],
      stockCount: 0,
      soldCount: 0,
      lowStockThreshold: lowStockThreshold ? parseInt(lowStockThreshold) : 10
    };

    if (inventoryType === 'manual' && inventoryItems) {
      try {
        const itemsArray = typeof inventoryItems === 'string' ? JSON.parse(inventoryItems) : inventoryItems;
        if (Array.isArray(itemsArray)) {
          inventoryData.items = itemsArray.map(item => ({
            details: item,
            status: 'available',
            createdAt: new Date()
          }));
          inventoryData.stockCount = itemsArray.length;
        }
      } catch (e) {
        console.error('Error parsing inventory items:', e);
      }
    }

    // Handle uploaded images
    const images = req.files ? req.files.map(file => ({
      fileId: file.id,
      url: file.url,
      filename: file.originalname,
      contentType: file.mimetype
    })) : [];

    // Create product
    const productData = {
      store: storeId,
      name,
      slug: finalSlug,
      description: description || '',
      shortDescription: shortDescription || '',
      price: parseFloat(price),
      comparePrice: comparePrice ? parseFloat(comparePrice) : undefined,
      cost: cost ? parseFloat(cost) : undefined,
      sku: sku || '',
      barcode: barcode || '',
      variants: parsedVariants,
      category: Array.isArray(parsedCategories) && parsedCategories.length > 0 ? parsedCategories[0] : 'General',
      categories: parsedCategories,
      tags: parsedTags,
      images: images,
      type: type || 'digital',
      status: status || 'active',
      visibility: visibility || 'public',
      stock: stock ? parseInt(stock) : 0,
      isUnlimitedStock: inventoryType === 'auto',
      inventory: inventoryData,
      weight: weight ? parseFloat(weight) : undefined,
      dimensions: parsedDimensions,
      seo: {
        title: seoTitle || '',
        description: seoDescription || '',
        keywords: seoKeywords ? seoKeywords.split(',').map(k => k.trim()) : []
      },
      customFields: parsedCustomFields,
      salesCount: 0,
      isActive: true,
      meta: {
        createdBy: req.user._id,
        updatedBy: req.user._id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
    };

    const product = await Product.create(productData);

    // Update store's product count
    await Store.findByIdAndUpdate(storeId, { $inc: { productCount: 1 } });

    res.status(201).json({
      success: true,
      data: product,
      message: 'Product created successfully',
      limits: {
        currentCount: existingProductsCount + 1,
        maxLimit: maxProducts,
        remaining: maxProducts - (existingProductsCount + 1),
        plan: userPlan
      }
    });

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create product'
    });
  }
};

// Get all products
exports.getAllProducts = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      category,
      type,
      status,
      minPrice,
      maxPrice,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = { 
      $or: [
        { visibility: 'public' },
        { status: 'active' }
      ]
    };

    // Search
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $regex: search, $options: 'i' } }
      ];
    }

    // Filters
    if (category) query.category = category;
    if (type) query.type = type;
    if (status) query.status = status;
    if (minPrice || maxPrice) {
      query.price = {};
      if (minPrice) query.price.$gte = parseFloat(minPrice);
      if (maxPrice) query.price.$lte = parseFloat(maxPrice);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('store', 'storeName storeSlug logo theme')
        .populate('meta.createdBy', 'name avatar')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: products,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products'
    });
  }
};

// Get product by ID
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('store', 'storeName storeSlug logo theme owner')
      .populate('meta.createdBy', 'name avatar');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Increment views if product is public/active
    if (product.status === 'active' && product.visibility === 'public') {
      product.views = (product.views || 0) + 1;
      await product.save();
    }

    res.json({
      success: true,
      data: product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product'
    });
  }
};

// Get products by store
exports.getProductsByStore = async (req, res) => {
  try {
    const { storeId } = req.params;
    const { page = 1, limit = 100, status, type } = req.query;

    console.log('🔍 Fetching products for storeId:', storeId);
    
    // Build query
    let query = {};
    
    // Check if storeId is a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(storeId)) {
      query.store = new mongoose.Types.ObjectId(storeId);
    } else {
      // Try to find store by slug first
      const store = await Store.findOne({ storeSlug: storeId }).select('_id');
      if (store) {
        query.store = store._id;
      } else {
        // If not found, return empty
        return res.json({
          success: true,
          data: [],
          meta: {
            page: parseInt(page),
            limit: parseInt(limit),
            total: 0,
            pages: 0
          }
        });
      }
    }
    
    // Filter by status if provided
    if (status) {
      query.status = status;
    } else {
      // For debugging inventory issues, show all non-archived products
      query.status = { $ne: 'archived' };
    }

    // For debugging inventory issues, log what we're filtering
    console.log('🔍 Inventory Debug - Query filters:', {
      store: query.store,
      status: query.status,
      type: query.type || 'all types'
    });
    
    // Filter by type if provided
    if (type) {
      query.type = type;
    }

    console.log('📊 Query:', JSON.stringify(query, null, 2));

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('store', 'storeName storeSlug logo')
        .lean(),
      Product.countDocuments(query)
    ]);

    console.log(`✅ Found ${products.length} products for store ${storeId}`);

    res.json({
      success: true,
      data: products,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('❌ Error fetching store products:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch store products',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Update product
exports.updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    // Find product
    const product = await Product.findById(productId).populate('store', 'owner members');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    const isOwner = product.store.owner.toString() === userId.toString();
    const isMember = product.store.members && product.store.members.some(member => 
      member.user.toString() === userId.toString() && 
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this product'
      });
    }

    const updates = { ...req.body };

    // Update slug if name changed
    if (updates.name && updates.name !== product.name) {
      updates.slug = slugify(updates.name, {
        lower: true,
        strict: true,
        trim: true
      });

      // Check slug uniqueness in same store
      const slugExists = await Product.findOne({
        slug: updates.slug,
        store: product.store._id,
        _id: { $ne: product._id }
      });

      if (slugExists) {
        updates.slug = `${updates.slug}-${Date.now().toString().slice(-6)}`;
      }
    }

    // Parse JSON fields if needed
    if (updates.variants && typeof updates.variants === 'string') {
      try {
        updates.variants = JSON.parse(updates.variants);
      } catch (e) {
        console.error('Error parsing variants:', e);
      }
    }

    if (updates.categories && typeof updates.categories === 'string') {
      try {
        updates.categories = JSON.parse(updates.categories);
        if (Array.isArray(updates.categories) && updates.categories.length > 0) {
          updates.category = updates.categories[0];
        }
      } catch (e) {
        console.error('Error parsing categories:', e);
      }
    }

    if (updates.tags && typeof updates.tags === 'string') {
      try {
        updates.tags = JSON.parse(updates.tags);
      } catch (e) {
        console.error('Error parsing tags:', e);
      }
    }

    if (updates.dimensions && typeof updates.dimensions === 'string') {
      try {
        updates.dimensions = JSON.parse(updates.dimensions);
      } catch (e) {
        console.error('Error parsing dimensions:', e);
      }
    }

    if (updates.customFields && typeof updates.customFields === 'string') {
      try {
        updates.customFields = JSON.parse(updates.customFields);
      } catch (e) {
        console.error('Error parsing custom fields:', e);
      }
    }

    // Handle images
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => ({
        fileId: file.id,
        url: file.url,
        filename: file.originalname,
        contentType: file.mimetype
      }));
      
      if (updates.replaceImages === 'true') {
        updates.images = newImages;
      } else {
        updates.images = [...product.images, ...newImages];
      }
    }

    // Update meta
    updates['meta.updatedAt'] = new Date();
    updates['meta.updatedBy'] = userId;

    // Update product
    const updatedProduct = await Product.findByIdAndUpdate(
      productId,
      updates,
      { new: true, runValidators: true }
    ).populate('store', 'storeName storeSlug');

    res.json({
      success: true,
      data: updatedProduct,
      message: 'Product updated successfully'
    });
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update product'
    });
  }
};

// Delete product (soft delete)
exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    // Find product
    const product = await Product.findById(productId).populate('store', 'owner members');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    const isOwner = product.store.owner.toString() === userId.toString();
    const isMember = product.store.members && product.store.members.some(member => 
      member.user.toString() === userId.toString() && 
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to delete this product'
      });
    }

    // Soft delete - mark as archived
    product.status = 'archived';
    product.isActive = false;
    await product.save();

    // Update store's product count
    await Store.findByIdAndUpdate(product.store._id, { $inc: { productCount: -1 } });

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product'
    });
  }
};

// Upload product images
exports.uploadImages = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Please upload at least one image'
      });
    }

    // Find product
    const product = await Product.findById(productId).populate('store', 'owner members');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    const isOwner = product.store.owner.toString() === userId.toString();
    const isMember = product.store.members && product.store.members.some(member => 
      member.user.toString() === userId.toString() && 
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this product'
      });
    }

    // Add new images
    const newImages = req.files.map(file => ({
      fileId: file.id,
      url: file.url,
      filename: file.originalname,
      contentType: file.mimetype
    }));
    product.images = [...product.images, ...newImages];
    product['meta.updatedAt'] = new Date();
    product['meta.updatedBy'] = userId;
    
    await product.save();

    res.json({
      success: true,
      data: { images: product.images },
      message: 'Images uploaded successfully'
    });
  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload images'
    });
  }
};

// Get product limits for current user
exports.getProductLimits = async (req, res) => {
  try {
    // Check if user has an active subscription
    let userPlan = 'free';
    if (req.user) {
      // First try direct subscription access
      let subscription = req.user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (req.user.user?.subscription) {
          subscription = req.user.user.subscription;
        } else if (req.user.profile?.subscription) {
          subscription = req.user.profile.subscription;
        } else if (req.user.data?.subscription) {
          subscription = req.user.data.subscription;
        } else if (req.user._doc?.subscription) { // Check mongoose document structure
          subscription = req.user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          userPlan = subscription.plan;
        }
      }
    }

    const planLimits = {
      free: 18,
      starter: 30,
      pro: 50,
      enterprise: 1000
    };

    const maxProducts = planLimits[userPlan] || 18;

    // Get current product count
    const existingProductsCount = await getCurrentProductCount(req.user._id);

    const canCreate = existingProductsCount < maxProducts;

    res.json({
      success: true,
      data: {
        currentProducts: existingProductsCount,
        maxProducts: maxProducts,
        plan: userPlan,
        canCreate: canCreate,
        remaining: maxProducts - existingProductsCount
      }
    });
  } catch (error) {
    console.error('Error fetching product limits:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product limits'
    });
  }
};

// Get user's products (for dashboard)
exports.getUserProducts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 20, status, storeId } = req.query;

    // Get all stores owned by the user
    const userStores = await Store.find({
      owner: userId,
      isActive: true,
      isBanned: { $ne: true }
    }).select('_id storeName storeSlug');

    if (userStores.length === 0) {
      return res.json({
        success: true,
        data: [],
        meta: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: 0,
          pages: 0
        }
      });
    }

    const storeIds = userStores.map(store => store._id);
    
    // Build query
    let query = {
      store: { $in: storeIds }
    };

    // Filter by specific store if provided
    if (storeId && mongoose.Types.ObjectId.isValid(storeId)) {
      query.store = new mongoose.Types.ObjectId(storeId);
    }

    // Filter by status if provided
    if (status) {
      if (status === 'all') {
        // Show all except archived
        query.status = { $ne: 'archived' };
      } else {
        query.status = status;
      }
    } else {
      // Default to active products
      query.status = 'active';
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [products, total] = await Promise.all([
      Product.find(query)
        .populate('store', 'storeName storeSlug logo')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Product.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: products,
      stores: userStores,
      meta: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching user products:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user products'
    });
  }
};

// Bulk update products
exports.bulkUpdateProducts = async (req, res) => {
  try {
    const { productIds, updates } = req.body;
    const userId = req.user._id;

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Product IDs are required'
      });
    }

    // Get all products to check ownership
    const products = await Product.find({ 
      _id: { $in: productIds } 
    }).populate('store', 'owner');

    // Check if user owns all products
    for (const product of products) {
      if (product.store.owner.toString() !== userId.toString()) {
        return res.status(403).json({
          success: false,
          error: `You don't have permission to update product: ${product.name}`
        });
      }
    }

    // Add update metadata
    updates['meta.updatedAt'] = new Date();
    updates['meta.updatedBy'] = userId;

    // Update all products
    const result = await Product.updateMany(
      { _id: { $in: productIds } },
      updates,
      { runValidators: true }
    );

    res.json({
      success: true,
      message: `${result.modifiedCount} products updated successfully`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('Error in bulk update:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update products'
    });
  }
};

// Get inventory for a product
exports.getProductInventory = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;

    // Find product
    const product = await Product.findById(productId).populate('store', 'owner members');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    const isOwner = product.store.owner.toString() === userId.toString();
    const isMember = product.store.members && product.store.members.some(member =>
      member.user.toString() === userId.toString() &&
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to view this product inventory'
      });
    }

    // Return inventory data
    res.json({
      success: true,
      data: {
        inventory: product.inventory || {
          type: 'none',
          items: [],
          stockCount: 0,
          soldCount: 0
        }
      }
    });
  } catch (error) {
    console.error('Error fetching product inventory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product inventory'
    });
  }
};

// Add inventory items to a product
exports.addProductInventory = async (req, res) => {
  try {
    const productId = req.params.id;
    const userId = req.user._id;
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Inventory items are required'
      });
    }

    // Find product
    const product = await Product.findById(productId).populate('store', 'owner members');

    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found'
      });
    }

    // Check ownership
    const isOwner = product.store.owner.toString() === userId.toString();
    const isMember = product.store.members && product.store.members.some(member =>
      member.user.toString() === userId.toString() &&
      ['admin', 'editor'].includes(member.role)
    );

    if (!isOwner && !isMember) {
      return res.status(403).json({
        success: false,
        error: 'You do not have permission to update this product inventory'
      });
    }

    // Use inventory service to add items
    const InventoryService = require('../services/inventoryService');
    const result = await InventoryService.addInventoryItems(productId, items);

    res.json({
      success: true,
      data: result,
      message: `${result.addedCount} inventory items added successfully`
    });
  } catch (error) {
    console.error('Error adding product inventory:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to add product inventory'
    });
  }
};

// Export the subscription check function
exports.checkSubscriptionLimits = checkSubscriptionLimits;