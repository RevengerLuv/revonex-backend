// [file name]: masterOwnerRoutes.js
const express = require('express');
const router = express.Router();
const masterOwnerController = require('../controllers/masterOwnerController');
const { auth, isOwner, require2FA } = require('../middleware/auth');

// Fallback for endpoints whose controller methods are not implemented yet.
const notImplemented = (methodName) => (req, res) => {
  return res.status(501).json({
    success: false,
    error: `Master owner endpoint "${methodName}" is not implemented yet.`,
  });
};

// Apply auth to all routes
router.use(auth);
router.use(isOwner);

// MASTER CONTROL ROUTES
router.post(
  '/master/command',
  require2FA,
  masterOwnerController.masterControlPanel || notImplemented('masterControlPanel'),
);
router.get(
  '/master/search/global',
  masterOwnerController.globalSearch || notImplemented('globalSearch'),
);
router.get(
  '/master/dashboard/realtime',
  masterOwnerController.realtimeDashboard || notImplemented('realtimeDashboard'),
);

// EMERGENCY ROUTES
router.post(
  '/system/emergency/shutdown',
  require2FA,
  masterOwnerController.emergencyShutdown || notImplemented('emergencyShutdown'),
);
router.post(
  '/system/maintenance',
  masterOwnerController.toggleMaintenanceMode || notImplemented('toggleMaintenanceMode'),
);
router.post(
  '/system/health',
  masterOwnerController.systemHealthCheck || notImplemented('systemHealthCheck'),
);

// USER CONTROL ROUTES
router.post(
  '/users/:userId/impersonate',
  require2FA,
  masterOwnerController.impersonateUser || notImplemented('impersonateUser'),
);
router.post(
  '/users/:userId/force-logout',
  masterOwnerController.forceLogoutUser || notImplemented('forceLogoutUser'),
);
router.post(
  '/users/:userId/reset-password',
  require2FA,
  masterOwnerController.resetUserPassword || notImplemented('resetUserPassword'),
);
router.post(
  '/users/bulk/delete',
  masterOwnerController.bulkDelete || notImplemented('bulkDelete'),
);
router.post(
  '/users/bulk/ban',
  masterOwnerController.bulkBan || notImplemented('bulkBan'),
);
router.post(
  '/users/bulk/activate',
  masterOwnerController.bulkActivate || notImplemented('bulkActivate'),
);

// STORE CONTROL ROUTES
router.post(
  '/stores/:storeId/suspend',
  masterOwnerController.suspendStore || notImplemented('suspendStore'),
);
router.post(
  '/stores/:storeId/activate',
  masterOwnerController.activateStore || notImplemented('activateStore'),
);
router.post(
  '/stores/bulk/delete',
  masterOwnerController.bulkDelete || notImplemented('bulkDelete'),
);
router.post(
  '/stores/bulk/suspend',
  masterOwnerController.bulkSuspend || notImplemented('bulkSuspend'),
);

// FINANCIAL CONTROL ROUTES
router.post(
  '/orders/:orderId/refund',
  require2FA,
  masterOwnerController.refundOrder || notImplemented('refundOrder'),
);
router.post(
  '/transactions/:transactionId/void',
  require2FA,
  masterOwnerController.voidTransaction || notImplemented('voidTransaction'),
);
router.post(
  '/users/:userId/balance/adjust',
  require2FA,
  masterOwnerController.adjustUserBalance || notImplemented('adjustUserBalance'),
);

// SYSTEM ROUTES
router.post(
  '/system/cache/purge',
  masterOwnerController.purgeSystemCache || notImplemented('purgeSystemCache'),
);
router.post(
  '/system/database/backup',
  require2FA,
  masterOwnerController.backupDatabase || notImplemented('backupDatabase'),
);
router.post(
  '/system/logs/clear',
  masterOwnerController.clearSystemLogs || notImplemented('clearSystemLogs'),
);

// EXPORT ROUTES
router.post(
  '/export/:type',
  masterOwnerController.exportData || notImplemented('exportData'),
);
router.post(
  '/export/bulk',
  masterOwnerController.bulkExport || notImplemented('bulkExport'),
);

// MONITORING ROUTES
router.get(
  '/monitoring/live',
  masterOwnerController.getLiveMonitoring || notImplemented('getLiveMonitoring'),
);
router.get(
  '/monitoring/alerts',
  masterOwnerController.getSystemAlerts || notImplemented('getSystemAlerts'),
);
router.get(
  '/monitoring/activities',
  masterOwnerController.getRecentActivities || notImplemented('getRecentActivities'),
);

module.exports = router;
