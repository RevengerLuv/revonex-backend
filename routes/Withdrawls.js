const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const auth = require('../middleware/auth');
const isOwner = require('../middleware/isOwner'); // Middleware to check if user is owner/admin

// User routes
router.post('/request', auth, withdrawalController.createWithdrawal);
router.get('/user/:storeId', auth, withdrawalController.getUserWithdrawals);
router.get('/info/:storeId', auth, withdrawalController.getWithdrawalInfo);
router.put('/cancel/:id', auth, withdrawalController.cancelWithdrawal);

// Owner routes (require owner/admin privileges)
router.get('/owner', auth, isOwner, withdrawalController.getOwnerWithdrawals);
router.get('/stats', auth, isOwner, withdrawalController.getWithdrawalStats);
router.put('/approve/:id', auth, isOwner, withdrawalController.approveWithdrawal);
router.put('/complete/:id', auth, isOwner, withdrawalController.completeWithdrawal);
router.put('/reject/:id', auth, isOwner, withdrawalController.rejectWithdrawal);

module.exports = router;