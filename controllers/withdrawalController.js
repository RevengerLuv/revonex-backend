const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const Store = require('../models/Store');
const Notification = require('../models/Notification');

const createWithdrawal = async (req, res) => {
  try {
    console.log('=== CREATE WITHDRAWAL ===');
    console.log('Full request body:', JSON.stringify(req.body, null, 2));
    console.log('User ID from token:', req.user.id);
    
    const {
      amount,
      paymentMethod,
      upiId,
      bankAccount,
      ifscCode,
      fullName,
      phone,
      address,
      notes
    } = req.body;
    
    const userId = req.user.id;

    // Quick validation
    if (!amount || !paymentMethod || !fullName || !phone || !address) {
      const missing = [];
      if (!amount) missing.push('amount');
      if (!paymentMethod) missing.push('paymentMethod');
      if (!fullName) missing.push('fullName');
      if (!phone) missing.push('phone');
      if (!address) missing.push('address');
      
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`
      });
    }

    // Get user
    const user = await User.findById(userId).select('email subscription');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Get store
    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    console.log('User found:', user.email);
    console.log('Store found:', store.storeName);
    console.log('Store revenue:', store.analytics?.revenue || 0);

    // Check if store has enough revenue
    const currentRevenue = store.analytics?.revenue || 0;
    const amountNum = parseFloat(amount);
    
    if (amountNum <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Amount must be greater than 0'
      });
    }

    // Users can withdraw up to 80% of total revenue
    const maxWithdrawable = currentRevenue * 0.8;
    
    if (amountNum > maxWithdrawable) {
      return res.status(400).json({
        success: false,
        error: `Cannot withdraw more than ${maxWithdrawable.toFixed(2)} (80% of your revenue)`
      });
    }

    // Check for pending withdrawals
    const pendingWithdrawals = await Withdrawal.find({
      storeId: store._id,
      status: { $in: ['pending', 'approved'] }
    });
    
    const totalPending = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const totalWithdrawn = await Withdrawal.aggregate([
      {
        $match: {
          storeId: store._id,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    const completedTotal = totalWithdrawn[0]?.total || 0;
    
    // Calculate available balance: 80% of revenue - (completed + pending)
    const availableBalance = Math.max(0, maxWithdrawable - completedTotal - totalPending);
    
    if (amountNum > availableBalance) {
      return res.status(400).json({
        success: false,
        error: `Insufficient available balance. Available: ${availableBalance.toFixed(2)}`
      });
    }

    // Calculate fees - Check if user has an active subscription
    let isProUser = false;
    if (user) {
      // First try direct subscription access
      let subscription = user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (user.user?.subscription) {
          subscription = user.user.subscription;
        } else if (user.profile?.subscription) {
          subscription = user.profile.subscription;
        } else if (user.data?.subscription) {
          subscription = user.data.subscription;
        } else if (user._doc?.subscription) { // Check mongoose document structure
          subscription = user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          isProUser = subscription.plan === 'pro';
        }
      }
    }
    const serviceFeeRate = isProUser ? 0 : 20;
    const serviceFee = amountNum * (serviceFeeRate / 100);
    const netAmount = amountNum - serviceFee;

    console.log('Fee calculation:', { amountNum, serviceFeeRate, serviceFee, netAmount });

    // Validate payment method
    if (paymentMethod === 'upi' && !upiId) {
      return res.status(400).json({
        success: false,
        error: 'UPI ID is required for UPI payments'
      });
    }

    if (paymentMethod === 'bank' && (!bankAccount || !ifscCode)) {
      return res.status(400).json({
        success: false,
        error: 'Bank account and IFSC code are required for bank transfers'
      });
    }

    // Create withdrawal
    const withdrawal = new Withdrawal({
      userId,
      storeId: store._id,
      storeName: store.storeName,
      amount: amountNum,
      serviceFee,
      serviceFeeRate,
      netAmount,
      paymentMethod,
      upiId: paymentMethod === 'upi' ? upiId : undefined,
      bankAccount: paymentMethod === 'bank' ? bankAccount : undefined,
      ifscCode: paymentMethod === 'bank' ? ifscCode : undefined,
      recipientDetails: {
        fullName,
        phone,
        address
      },
      notes,
      status: 'pending'
    });

    console.log('Saving withdrawal...');
    await withdrawal.save();
    console.log('Withdrawal saved with ID:', withdrawal._id);

    // ========== IMMEDIATE REVENUE DEDUCTION ==========
    // Deduct the amount from store revenue immediately upon submission
    const newRevenue = Math.max(0, currentRevenue - amountNum);
    store.analytics.revenue = newRevenue;
    store.balance = newRevenue; // Also update balance
    
    // Update withdrawal info with deduction record
    withdrawal.revenueDeducted = amountNum;
    withdrawal.previousRevenue = currentRevenue;
    withdrawal.newRevenue = newRevenue;
    await withdrawal.save();
    
    await store.save();

    console.log(`Deducted $${amountNum} from store ${store.storeName} immediately. New revenue: $${newRevenue}`);

    // Create notification for user
    await Notification.create({
      userId: userId,
      type: 'withdrawal_requested',
      title: 'Withdrawal Request Submitted',
      message: `Your withdrawal request for $${amountNum} has been submitted successfully.`,
      data: {
        withdrawalId: withdrawal._id,
        amount: amountNum,
        status: 'pending'
      }
    });

    res.status(201).json({
      success: true,
      message: 'Withdrawal request submitted successfully!',
      data: {
        id: withdrawal._id,
        transactionId: withdrawal.transactionId,
        amount: withdrawal.amount,
        netAmount: withdrawal.netAmount,
        status: withdrawal.status,
        createdAt: withdrawal.createdAt,
        revenueDeducted: amountNum,
        newRevenue: newRevenue
      }
    });

  } catch (error) {
    console.error('=== CREATE WITHDRAWAL ERROR ===');
    console.error('Error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error: ' + error.message
    });
  }
};

const getWithdrawalStats = async (req, res) => {
  try {
    const stats = await Withdrawal.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      }
    ]);

    // Format stats
    const formattedStats = {
      byStatus: stats,
      total: {
        count: stats.reduce((sum, stat) => sum + stat.count, 0),
        amount: stats.reduce((sum, stat) => sum + stat.amount, 0)
      },
      today: {
        count: 0,
        amount: 0
      }
    };

    // Add today's stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayStats = await Withdrawal.aggregate([
      {
        $match: {
          createdAt: { $gte: today }
        }
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          amount: { $sum: '$amount' }
        }
      }
    ]);

    if (todayStats.length > 0) {
      formattedStats.today = todayStats[0];
    }

    res.json({
      success: true,
      data: formattedStats
    });

  } catch (error) {
    console.error('Get withdrawal stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const approveWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal is not in pending status'
      });
    }

    withdrawal.status = 'approved';
    withdrawal.approvedAt = new Date();
    withdrawal.approvedBy = ownerId;
    await withdrawal.save();

    // Notify user
    await Notification.create({
      userId: withdrawal.userId,
      type: 'withdrawal_approved',
      title: 'Withdrawal Approved',
      message: `Your withdrawal of $${withdrawal.amount} has been approved. It will be processed soon.`,
      data: { withdrawalId: withdrawal._id, amount: withdrawal.amount }
    });

    res.json({
      success: true,
      message: 'Withdrawal approved successfully',
      data: withdrawal
    });

  } catch (error) {
    console.error('Approve withdrawal error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const completeWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { ownerTransactionId } = req.body;
    const ownerId = req.user.id;

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'approved') {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal must be approved before marking as paid'
      });
    }

    // ========== IMPORTANT: Update store revenue ==========
    const store = await Store.findById(withdrawal.storeId);
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Check if enough revenue is available
    const currentRevenue = store.analytics?.revenue || 0;
    if (currentRevenue < withdrawal.amount) {
      return res.status(400).json({
        success: false,
        error: `Insufficient revenue. Store has $${currentRevenue}, withdrawal is $${withdrawal.amount}`
      });
    }

    // Update withdrawal status
    withdrawal.status = 'completed';
    withdrawal.completedAt = new Date();
    withdrawal.completedBy = ownerId;
    withdrawal.ownerTransactionId = ownerTransactionId;
    await withdrawal.save();

    // Note: Revenue was already deducted when withdrawal was created
    // No additional deduction needed here

    console.log(`Withdrawal $${withdrawal.amount} marked as completed for store ${store.storeName}`);

    res.json({
      success: true,
      message: 'Withdrawal marked as paid successfully',
      data: {
        withdrawal,
        store: {
          currentRevenue: currentRevenue,
          note: 'Revenue was already deducted upon submission'
        }
      }
    });

  } catch (error) {
    console.error('Complete withdrawal error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const getUserWithdrawalHistory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { status, limit = 50 } = req.query;

    const query = { userId };

    // Filter by status if provided
    if (status && status !== 'all') {
      query.status = status;
    } else if (!status || status !== 'all') {
      // By default, exclude pending withdrawals from history
      query.status = { $in: ['approved', 'rejected', 'completed'] };
    }

    // Get withdrawals for this user
    const withdrawals = await Withdrawal.find(query)
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    console.log(`Found ${withdrawals.length} withdrawals for user ${userId}`);

    res.json({
      success: true,
      data: withdrawals,
      total: withdrawals.length
    });

  } catch (error) {
    console.error('Get user history error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
};

const getUserPendingWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get store for this user
    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return res.json({
        success: true,
        data: [],
        totals: { totalAmount: 0, totalFees: 0, totalNet: 0 },
        count: 0
      });
    }

    // Get pending and approved withdrawals for this store
    const withdrawals = await Withdrawal.find({
      storeId: store._id,
      status: { $in: ['pending', 'approved'] }
    })
    .sort({ createdAt: -1 });

    // Calculate totals
    const totals = withdrawals.reduce((acc, w) => {
      acc.totalAmount += w.amount;
      acc.totalFees += w.serviceFee;
      acc.totalNet += w.netAmount;
      return acc;
    }, { totalAmount: 0, totalFees: 0, totalNet: 0 });

    console.log(`Found ${withdrawals.length} pending withdrawals for store ${store.storeName}`);

    res.json({
      success: true,
      data: withdrawals,
      totals,
      count: withdrawals.length
    });

  } catch (error) {
    console.error('Get user pending withdrawals error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};
const rejectWithdrawal = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason } = req.body;
    const ownerId = req.user.id;

    if (!rejectionReason) {
      return res.status(400).json({
        success: false,
        error: 'Rejection reason is required'
      });
    }

    const withdrawal = await Withdrawal.findById(id);
    if (!withdrawal) {
      return res.status(404).json({
        success: false,
        error: 'Withdrawal not found'
      });
    }

    if (withdrawal.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Withdrawal is not in pending status'
      });
    }

    withdrawal.status = 'rejected';
    withdrawal.rejectedAt = new Date();
    withdrawal.rejectedBy = ownerId;
    withdrawal.rejectionReason = rejectionReason;
    await withdrawal.save();

    // Notify user
    await Notification.create({
      userId: withdrawal.userId,
      type: 'withdrawal_rejected',
      title: 'Withdrawal Rejected',
      message: `Your withdrawal request has been rejected. Reason: ${rejectionReason}`,
      data: {
        withdrawalId: withdrawal._id,
        amount: withdrawal.amount,
        reason: rejectionReason
      }
    });

    res.json({
      success: true,
      message: 'Withdrawal rejected successfully',
      data: withdrawal
    });

  } catch (error) {
    console.error('Reject withdrawal error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const getOwnerWithdrawals = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') {
      query.status = status;
    }

    const withdrawals = await Withdrawal.find(query)
      .populate('userId', 'email subscriptionPlan')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Withdrawal.countDocuments(query);

    res.json({
      success: true,
      data: withdrawals,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get owner withdrawals error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const getUserWithdrawals = async (req, res) => {
  try {
    const userId = req.user.id;
    const { storeId, status } = req.query;

    const query = { userId };
    if (storeId) {
      query.storeId = storeId;
    }
    if (status && status !== 'all') {
      query.status = status;
    }

    const withdrawals = await Withdrawal.find(query)
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: withdrawals
    });

  } catch (error) {
    console.error('Get user withdrawals error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const getWithdrawalInfo = async (req, res) => {
  try {
    const userId = req.user.id;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    // Get user to check plan
    const user = await User.findById(userId);

    // Check if user has an active subscription (same logic as createWithdrawal)
    let isProUser = false;
    if (user) {
      // First try direct subscription access
      let subscription = user.subscription;

      // If not found, check common nested structures
      if (!subscription) {
        if (user.user?.subscription) {
          subscription = user.user.subscription;
        } else if (user.profile?.subscription) {
          subscription = user.profile.subscription;
        } else if (user.data?.subscription) {
          subscription = user.data.subscription;
        } else if (user._doc?.subscription) { // Check mongoose document structure
          subscription = user._doc.subscription;
        }
      }

      // Only use the plan if subscription is active and not expired
      if (subscription && subscription.status === 'active' && subscription.plan) {
        // Double-check if subscription hasn't expired
        const now = new Date();
        const endDate = new Date(subscription.endDate);
        if (now <= endDate) {
          isProUser = subscription.plan === 'pro';
        }
      }
    }

    // Calculate from revenue
    const totalRevenue = store.analytics?.revenue || 0;
    
    // Get completed withdrawals
    const completedWithdrawals = await Withdrawal.find({
      storeId: store._id,
      status: 'completed'
    });
    
    // Get pending/approved withdrawals
    const pendingWithdrawals = await Withdrawal.find({
      storeId: store._id,
      status: { $in: ['pending', 'approved'] }
    });
    
    // Calculate totals
    const totalWithdrawn = completedWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    const totalPending = pendingWithdrawals.reduce((sum, w) => sum + w.amount, 0);
    
    // ========== FIXED CALCULATION ==========
    // Users can withdraw up to 80% of their TOTAL REVENUE
    const maxWithdrawalLimit = totalRevenue * 0.8;
    
    // Available balance = Max withdrawal limit - (Total withdrawn + Total pending)
    const availableBalance = Math.max(0, maxWithdrawalLimit - totalWithdrawn - totalPending);
    // =======================================

    // For PRO users, they can withdraw more since they don't pay fees
    const serviceFeeRate = isProUser ? 0 : 20;

    res.json({
      success: true,
      data: {
        availableBalance,
        maxWithdrawable: availableBalance, // This should NOT be 0
        totalPending,
        pendingCount: pendingWithdrawals.length,
        serviceFeeRate,
        isProUser,
        withdrawalInfo: store.withdrawalInfo || null,
        stats: {
          totalRevenue,
          totalWithdrawn,
          maxWithdrawalLimit,
          pendingAmount: totalPending,
          revonexFee: totalRevenue * 0.2 // 20% fee on total revenue
        }
      }
    });

  } catch (error) {
    console.error('Get withdrawal info error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const saveWithdrawalInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fullName, address, phone, upiId, bankAccount, ifscCode } = req.body;

    const store = await Store.findOne({ owner: userId });
    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    store.withdrawalInfo = {
      fullName,
      address,
      phone,
      upiId,
      bankAccount,
      ifscCode,
      updatedAt: new Date()
    };

    await store.save();

    res.json({
      success: true,
      message: 'Payment details saved successfully'
    });

  } catch (error) {
    console.error('Save withdrawal info error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const debugWithdrawalInfo = async (req, res) => {
  try {
    const userId = req.user.id;
    const store = await Store.findOne({ owner: userId });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    const withdrawals = await Withdrawal.find({ storeId: store._id });

    // Calculate totals for debug info
    const totalRevenue = store.analytics?.revenue || 0;
    const totalWithdrawn = withdrawals
      .filter(w => w.status === 'completed')
      .reduce((sum, w) => sum + w.amount, 0);
    const totalPending = withdrawals
      .filter(w => w.status === 'pending' || w.status === 'approved')
      .reduce((sum, w) => sum + w.amount, 0);
    const maxWithdrawalLimit = totalRevenue * 0.8;
    const calculatedAvailableBalance = Math.max(0, maxWithdrawalLimit - totalWithdrawn - totalPending);

    res.json({
      success: true,
      data: {
        debug: {
          store: {
            id: store._id,
            revenue: totalRevenue,
            balance: store.balance || 0
          },
          totalRevenue,
          maxWithdrawalLimit,
          totalWithdrawn,
          totalPending,
          calculatedAvailableBalance,
          withdrawals: withdrawals.map(w => ({
            id: w._id,
            amount: w.amount,
            status: w.status,
            createdAt: w.createdAt
          }))
        }
      }
    });
  } catch (error) {
    console.error('Debug withdrawal info error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

const createTestWithdrawal = async (req, res) => {
  try {
    const userId = req.user.id;
    const store = await Store.findOne({ owner: userId });

    if (!store) {
      return res.status(404).json({
        success: false,
        error: 'Store not found'
      });
    }

    const testWithdrawal = new Withdrawal({
      userId,
      storeId: store._id,
      storeName: store.storeName,
      amount: 100,
      serviceFee: 20,
      serviceFeeRate: 20,
      netAmount: 80,
      paymentMethod: 'upi',
      upiId: 'test@upi',
      recipientDetails: {
        fullName: 'Test User',
        phone: '1234567890',
        address: 'Test Address'
      },
      status: 'pending'
    });

    await testWithdrawal.save();

    res.json({
      success: true,
      message: 'Test withdrawal created',
      data: testWithdrawal
    });
  } catch (error) {
    console.error('Create test withdrawal error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
};

module.exports = {
  createWithdrawal,
  getUserWithdrawals,
  getUserWithdrawalHistory,
  getUserPendingWithdrawals,
  getWithdrawalInfo,
  saveWithdrawalInfo,
  debugWithdrawalInfo,
  createTestWithdrawal,
  getOwnerWithdrawals,
  getWithdrawalStats,
  approveWithdrawal,
  completeWithdrawal,
  rejectWithdrawal
};


