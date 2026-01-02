const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { auth, isAdmin } = require('../middleware/auth');

// Apply auth middleware to all routes
router.use(auth);

// Admin routes
router.get('/stats', isAdmin, adminController.getAdminStats);
router.get('/stores', isAdmin, adminController.getAllStores);
router.put('/user/:userId/role', isAdmin, adminController.updateUserRole);
router.put('/user/:userId/plan', isAdmin, adminController.updateUserPlan);

module.exports = router;