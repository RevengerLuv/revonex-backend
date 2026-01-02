const express = require('express');
const router = express.Router();
const ownerController = require('../controllers/ownerController');
const { auth, isOwner } = require('../middleware/auth');
const { storeOwnerOrOwner } = require('../middleware/storeOwnerOrOwner'); // Change this line
const ownerUserController = require('../controllers/ownerUserController');
// Apply auth middleware to all routes
router.use(auth);

// Basic routes (keep these)
router.get('/owner-stats', isOwner, ownerController.getOwnerStats);
router.get('/all-stores', isOwner, ownerController.getAllStores);
router.get('/all-users', isOwner, ownerController.getAllUsers);
router.get('/premium-users', isOwner, ownerController.getPremiumUsers);
// ADD THESE NEW ROUTES:
router.get('/financial-summary', isOwner, ownerController.getFinancialSummary);
router.get('/system-status', isOwner, ownerController.getSystemStatus);
router.get('/performance-metrics', isOwner, ownerController.getPerformanceMetrics);
router.get('/activity', isOwner, ownerController.getActivityLogs);
router.get('/system-metrics', isOwner, ownerController.getSystemMetrics);
router.get('/platform-overview', isOwner, ownerController.getPlatformOverview);
// Add these routes in owner.js - USE storeOwnerOrOwner INSTEAD of ownerAuth
router.post('/users/cancel-subscription', storeOwnerOrOwner, ownerController.cancelUserSubscription);
router.delete('/users/delete/:userId', storeOwnerOrOwner, ownerController.deleteUser);
router.post('/upgrade-to-premium', storeOwnerOrOwner, ownerController.upgradeToPremium);
// Add these routes
router.post('/users/:userId/ban', storeOwnerOrOwner, ownerController.banUser);
router.post('/users/:userId/unban', storeOwnerOrOwner, ownerController.unbanUser);
// User Management Routes
router.post('/users/:userId/ban-with-reason', storeOwnerOrOwner, ownerUserController.banUserWithReason);
router.post('/users/:userId/unban', storeOwnerOrOwner, ownerUserController.unbanUser);
router.post('/users/:userId/update-role', storeOwnerOrOwner, ownerUserController.updateUserRole);
router.delete('/users/delete/:userId', storeOwnerOrOwner, ownerUserController.deleteUser);
router.post('/users/cancel-subscription', storeOwnerOrOwner, ownerUserController.cancelUserSubscription);
router.post('/upgrade-to-premium', storeOwnerOrOwner, ownerUserController.upgradeToPremium);
module.exports = router;