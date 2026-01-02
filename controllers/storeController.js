const Store = require('../models/Store');
const Product = require('../models/Products');
const slugify = require('slugify');

// Create store
exports.createStore = async (req, res) => {
  try {
    console.log('🟡 DEBUG createStore - Starting...');
    console.log('📝 Request body:', req.body);
    console.log('📁 Files:', req.files);
    
    const { storeName, description, contactEmail, template = 'modern' } = req.body;
    
    // CRITICAL FIX: Use req.user._id (not req.user.id or req.userId)
    const ownerId = req.user._id;
    
    if (!ownerId) {
      console.log('❌ No owner ID found in request');
      return res.status(401).json({
        success: false,
        error: 'User not authenticated'
      });
    }

    console.log('✅ Owner ID:', ownerId.toString());

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

    const planLimits = {
      free: 5,
      starter: 15,
      pro: 30,
      enterprise: 100
    };

    const maxStores = planLimits[userPlan] || 0;
    
    const existingStoresCount = await Store.countDocuments({
      owner: ownerId,
      isActive: true,
      isBanned: { $ne: true }
    });

    if (existingStoresCount >= maxStores) {
      return res.status(400).json({
        success: false,
        error: `Store creation limit reached. Your ${userPlan} plan allows up to ${maxStores} stores.`
      });
    }

    // Generate slug
    const storeSlug = slugify(storeName, {
      lower: true,
      strict: true,
      trim: true
    });

    // Check if slug already exists
    const existingStore = await Store.findOne({ storeSlug });
    if (existingStore) {
      return res.status(400).json({
        success: false,
        error: 'Store name already taken'
      });
    }

    // Handle file uploads
    let logoPath = '';
    let bannerPath = '';
    
    if (req.files) {
      const logoFile = req.files.find(f => f.fieldname === 'logo');
      const bannerFile = req.files.find(f => f.fieldname === 'banner');
      
      if (logoFile && logoFile.id) {
        logoPath = {
          fileId: logoFile.id,
          url: logoFile.url,
          filename: logoFile.originalname,
          contentType: logoFile.mimetype
        };
        console.log('📸 Logo uploaded to GridFS:', logoPath);
      }
      if (bannerFile && bannerFile.id) {
        bannerPath = {
          fileId: bannerFile.id,
          url: bannerFile.url,
          filename: bannerFile.originalname,
          contentType: bannerFile.mimetype
        };
        console.log('📸 Banner uploaded to GridFS:', bannerPath);
      }
    }

    // Create store
    const storeData = {
      owner: ownerId,
      storeName,
      storeSlug,
      description: description || '',
      contactEmail,
      logo: logoPath,
      banner: bannerPath,
      template: template,
      theme: {
        primaryColor: '#3B82F6',
        secondaryColor: '#1E40AF',
        fontFamily: 'Inter'
      },
      settings: {
        currency: 'INR',
        language: 'en',
        autoDigitalDelivery: true,
        requireLoginToPurchase: false
      },
      isActive: true
    };

    console.log('📦 Creating store with data:', {
      storeName,
      storeSlug,
      owner: ownerId.toString(),
      template
    });

    const store = await Store.create(storeData);

    // Convert to plain object to avoid BSON issues
    const storeObject = store.toObject();

    console.log('✅ Store created successfully:', storeObject.storeSlug);

    res.status(201).json({
      success: true,
      message: 'Store created successfully',
      data: { store: storeObject }
    });
  } catch (error) {
    console.error('❌ Error creating store:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to create store',
      message: error.message
    });
  }
};
// Get store by slug
// Get store by slug - FIXED VERSION
exports.getStoreBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    console.log('Fetching store with slug:', slug);

    const store = await Store.findOne({
      storeSlug: slug,
      $or: [
        { isActive: true },
        { isActive: { $exists: false } } // Handle stores without isActive field
      ],
      isBanned: { $ne: true } // Store should not be banned
    })
      .populate('owner', 'name avatar')
      .select('-settings -isBanned -analytics')
      .lean(); // Use lean() for better performance

    console.log('Store found:', store ? 'Yes' : 'No');
    
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Log store details
    console.log('Store details:', {
      storeId: store._id, // THIS IS IMPORTANT
      storeName: store.storeName,
      storeSlug: store.storeSlug,
      isActive: store.isActive,
      isBanned: store.isBanned,
      template: store.template
    });

    // Check if store._id exists
    if (!store._id) {
      console.error('❌ CRITICAL: Store has no _id field!');
      return res.status(500).json({
        success: false,
        error: 'Store data corrupted'
      });
    }

    // Initialize analytics if not exists
    if (!store.analytics) {
      store.analytics = {
        totalViews: 0,
        totalSales: 0,
        revenue: 0
      };
    }

    // Increment view count
    await Store.findByIdAndUpdate(store._id, {
      $inc: { 'analytics.totalViews': 1 }
    });

    // Get store products - FIXED QUERY
    console.log('🛍️ Fetching products for store ID:', store._id);
    
    const products = await Product.find({
      $and: [
        {
          $or: [
            { store: store._id },
            { storeId: store._id },
            { 'store._id': store._id }
          ]
        },
        {
          $or: [
            { isActive: true },
            { isActive: { $exists: false } },
            { status: 'active' },
            { status: 'published' },
            { status: { $exists: false } }
          ]
        }
      ]
    })
    .select('name price images category type slug description shortDescription status')
    .lean();

    console.log('Products found:', products.length);

    // Format products for frontend
    const formattedProducts = products.map(product => ({
      _id: product._id,
      name: product.name || 'Unnamed Product',
      price: product.price || 0,
      images: product.images || [],
      category: product.category || 'General',
      type: product.type || 'digital',
      slug: product.slug || '',
      description: product.description || '',
      shortDescription: product.shortDescription || '',
      status: product.status || 'active'
    }));

    // Return simplified store data without analytics
    const storeData = {
      _id: store._id,
      storeName: store.storeName,
      storeSlug: store.storeSlug,
      description: store.description,
      contactEmail: store.contactEmail,
      phone: store.phone,
      address: store.address,
      shippingTime: store.shippingTime,
      returnPolicy: store.returnPolicy,
      template: store.template,
      theme: store.theme,
      branding: store.branding,
      logo: store.logo,
      banner: store.banner,
      owner: store.owner,
      createdAt: store.createdAt
    };

   res.json({
  success: true,
  data: {  // NESTED like before
    store: storeData,
    products: formattedProducts
  }
});
  } catch (error) {
    console.error('Detailed error in getStoreBySlug:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch store',
      message: error.message
    });
  }
};

// Get user's stores
exports.getMyStores = async (req, res) => {
  try {
    const stores = await Store.find({ owner: req.user.id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: { stores }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stores'
    });
  }
};

// Update store
exports.updateStore = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check ownership
    const store = await Store.findOne({
      _id: id,
      owner: req.user.id
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Update slug if store name changed
    if (updates.storeName && updates.storeName !== store.storeName) {
      updates.storeSlug = slugify(updates.storeName, {
        lower: true,
        strict: true,
        trim: true
      });

      // Check if new slug exists
      const slugExists = await Store.findOne({
        storeSlug: updates.storeSlug,
        _id: { $ne: store._id }
      });

      if (slugExists) {
        return res.status(400).json({
          success: false,
          error: 'Store name already taken'
        });
      }
    }

    // Update store
    Object.keys(updates).forEach(key => {
      store[key] = updates[key];
    });

    await store.save();

    res.json({
      success: true,
      message: 'Store updated successfully',
      data: { store }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to update store'
    });
  }
};

// Delete store
exports.deleteStore = async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const store = await Store.findOne({
      _id: id,
      owner: req.user.id
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Soft delete
    store.isActive = false;
    await store.save();

    res.json({
      success: true,
      message: 'Store deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to delete store'
    });
  }
};

// Upload store logo
exports.uploadLogo = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'Please upload an image'
      });
    }

    // Check ownership
    const store = await Store.findOne({
      _id: id,
      owner: req.user.id
    });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Update logo
    store.logo = req.file.path;
    await store.save();

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: { logo: store.logo }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to upload logo'
    });
  }
};

// Get store analytics
exports.getStoreAnalytics = async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership
    const store = await Store.findOne({
      _id: id,
      owner: req.user.id
    }).select('analytics storeName');

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Get recent orders
    const recentOrders = await Order.find({ store: store._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .select('orderId total status createdAt');

    // Get top products
    const topProducts = await Product.find({ store: store._id })
      .sort({ salesCount: -1 })
      .limit(5)
      .select('name price salesCount');

    // Calculate conversion rate
    const conversionRate = store.analytics.totalViews > 0
      ? ((store.analytics.totalSales / store.analytics.totalViews) * 100).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        storeName: store.storeName,
        analytics: store.analytics,
        conversionRate,
        recentOrders,
        topProducts
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to fetch analytics'
    });
  }
};