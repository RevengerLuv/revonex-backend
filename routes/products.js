const express = require('express');
const router = express.Router();
const productController = require('../controllers/productController');
const { auth, isStoreOwner } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const checkProductLimit = require('../middleware/checkProductLimit');
// Configure multer for local storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});
console.log('auth:', typeof auth);
console.log('isStoreOwner:', typeof isStoreOwner);
console.log('upload:', typeof upload);
console.log('upload.array:', upload?.array);
console.log('createProduct:', typeof productController.createProduct);
console.log('uploadImages:', typeof productController.uploadImages);

// @route   POST /api/products
// @desc    Create a new product
router.post('/', auth, checkProductLimit, upload.array('images', 10), productController.createProduct);

// @route   GET /api/products
// @desc    Get all products (with filters)
router.get('/', productController.getAllProducts);

// @route   GET /api/products/store/:storeId
// @desc    Get products by store (MUST come before /:id route)
router.get('/store/:storeId', productController.getProductsByStore);

// @route   GET /api/products/:id
// @desc    Get product by ID
router.get('/:id', productController.getProductById);

// @route   PUT /api/products/:id
// @desc    Update product
router.put('/:id', auth, isStoreOwner, upload.array('images', 10), productController.updateProduct);

// @route   DELETE /api/products/:id
// @desc    Delete product
router.delete('/:id', auth, isStoreOwner, productController.deleteProduct);

// @route   POST /api/products/:id/upload-images
// @desc    Upload product images
router.post('/:id/upload-images', auth, isStoreOwner, upload.array('images', 10), productController.uploadImages);

// @route   GET /api/products/:id/inventory
// @desc    Get product inventory
router.get('/:id/inventory', auth, productController.getProductInventory);

// @route   POST /api/products/:id/inventory
// @desc    Add inventory items to product
router.post('/:id/inventory', auth, productController.addProductInventory);

module.exports = router;
