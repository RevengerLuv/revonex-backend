const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const { auth } = require("../middleware/auth"); // Add auth middleware

// Apply auth middleware to all payment routes
router.use(auth);

// Razorpay routes
router.post("/razorpay/create", paymentController.createRazorpayOrder);
router.post("/razorpay/verify", paymentController.verifyPayment);

// Other payment routes...
router.get("/status/:orderId", paymentController.getPaymentStatus);
router.post("/upi/create", paymentController.createUPIPayment);
router.post("/crypto/create", paymentController.createCryptoPayment);

module.exports = router;