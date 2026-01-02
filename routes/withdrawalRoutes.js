const express = require('express');
const router = express.Router();
const withdrawalController = require('../controllers/withdrawalController');
const { auth } = require('../middleware/auth');

// ==================== USER ROUTES ====================
router.post('/request', auth, withdrawalController.createWithdrawal);
router.get('/user', auth, withdrawalController.getUserWithdrawals); // All user withdrawals
router.get('/user/history', auth, withdrawalController.getUserWithdrawalHistory); // User history
router.get('/user/pending', auth, withdrawalController.getUserPendingWithdrawals); // User pending
router.get('/user/pending/:storeId', auth, withdrawalController.getUserPendingWithdrawals); // Specific store pending
router.get('/info', auth, withdrawalController.getWithdrawalInfo);
router.post('/info', auth, withdrawalController.saveWithdrawalInfo);
router.get('/debug', auth, withdrawalController.debugWithdrawalInfo);
router.post('/test-simple', auth, withdrawalController.createTestWithdrawal);

// ==================== OWNER ROUTES ====================
router.get('/owner', auth, withdrawalController.getOwnerWithdrawals);
router.get('/stats', auth, withdrawalController.getWithdrawalStats);
router.put('/approve/:id', auth, withdrawalController.approveWithdrawal);
router.put('/complete/:id', auth, withdrawalController.completeWithdrawal);
router.put('/reject/:id', auth, withdrawalController.rejectWithdrawal);
// Add this route for backward compatibility or specific needs
router.get('/history/:storeId', auth, withdrawalController.getUserWithdrawalHistory);
router.get('/pending/:storeId', auth, withdrawalController.getUserPendingWithdrawals);
module.exports = router;