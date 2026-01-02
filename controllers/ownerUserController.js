// controllers/ownerUserController.js
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');

const ownerUserController = {
  // POST /api/owner/users/:userId/ban-with-reason
  async banUserWithReason(req, res) {
    try {
      const { userId } = req.params;
      const { reason, duration, notifyUser } = req.body;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Update ban info
      user.isBanned = true;
      user.banReason = reason || 'Violation of terms';
      user.bannedAt = new Date();
      user.bannedBy = adminId;
      
      await user.save();
      
      // Log the action
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: 'ban_user',
        entityType: 'user',
        entityId: userId,
        metadata: {
          reason,
          duration,
          notifyUser: notifyUser || false
        }
      });
      
      // If you have email service, send notification here
      // await sendBanNotificationEmail(user.email, reason);
      
      res.json({ 
        success: true, 
        message: 'User banned successfully',
        user: {
          id: user._id,
          name: user.name,
          isBanned: user.isBanned,
          banReason: user.banReason
        }
      });
    } catch (error) {
      console.error('Ban user error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to ban user' 
      });
    }
  },

  // POST /api/owner/users/:userId/unban
  async unbanUser(req, res) {
    try {
      const { userId } = req.params;
      const { reason } = req.body;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Update user
      user.isBanned = false;
      user.unbanReason = reason || 'Unbanned by admin';
      user.unbannedAt = new Date();
      user.unbannedBy = adminId;
      
      await user.save();
      
      // Log the action
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: 'unban_user',
        entityType: 'user',
        entityId: userId,
        metadata: { reason }
      });
      
      res.json({ 
        success: true, 
        message: 'User unbanned successfully',
        user: {
          id: user._id,
          name: user.name,
          isBanned: user.isBanned
        }
      });
    } catch (error) {
      console.error('Unban user error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to unban user' 
      });
    }
  },

  // POST /api/owner/users/:userId/update-role
  async updateUserRole(req, res) {
    try {
      const { userId } = req.params;
      const { planId, planName, price, action } = req.body;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      const plans = {
        free: { name: 'Free', price: 0 },
        starter: { name: 'Starter', price: 149 },
        pro: { name: 'Pro', price: 349 },
        enterprise: { name: 'Enterprise', price: 999 }
      };
      
      let message = '';
      
      if (action === 'upgrade') {
        const plan = plans[planId] || plans.free;
        
        user.subscription = {
          plan: planId,
          planName: plan.name,
          price: plan.price,
          status: 'active',
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
          upgradedBy: adminId,
          upgradedAt: new Date()
        };
        
        message = `User upgraded to ${plan.name} plan`;
        
      } else if (action === 'downgrade') {
        user.subscription = {
          plan: 'free',
          planName: 'Free',
          price: 0,
          status: 'active',
          startDate: new Date(),
          downgradedBy: adminId,
          downgradedAt: new Date()
        };
        
        message = 'User downgraded to Free plan';
        
      } else if (action === 'cancel') {
        if (user.subscription) {
          user.subscription.status = 'cancelled';
          user.subscription.cancelledAt = new Date();
          user.subscription.cancelledBy = adminId;
          user.subscription.cancellationReason = 'Cancelled by admin';
        }
        
        message = 'User subscription cancelled';
      }
      
      await user.save();
      
      // Log the action
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: action === 'upgrade' ? 'admin_upgrade' : 'admin_downgrade',
        targetId: userId,
        details: {
          previousPlan: user.subscription?.planName,
          newPlan: planName,
          action
        }
      });
      
      res.json({ 
        success: true, 
        message,
        user: {
          id: user._id,
          name: user.name,
          subscription: user.subscription
        }
      });
    } catch (error) {
      console.error('Update user role error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to update user role' 
      });
    }
  },

  // DELETE /api/owner/users/delete/:userId
  async deleteUser(req, res) {
    try {
      const { userId } = req.params;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Check if user is owner/admin (prevent deleting them)
      if (user.role === 'owner' || user.role === 'admin') {
        return res.status(403).json({ 
          success: false, 
          message: 'Cannot delete owner or admin users' 
        });
      }
      
      // Log the action before deletion
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: 'delete_user',
        entityType: 'user',
        entityId: userId,
        metadata: {
          userEmail: user.email,
          userName: user.name,
          userRole: user.role
        }
      });
      
      // Soft delete (mark as deleted)
      user.isDeleted = true;
      user.deletedAt = new Date();
      user.deletedBy = adminId;
      await user.save();
      
      // Or for hard delete: await User.findByIdAndDelete(userId);
      
      res.json({ 
        success: true, 
        message: 'User deleted successfully' 
      });
    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to delete user' 
      });
    }
  },

  // POST /api/owner/users/cancel-subscription
  async cancelUserSubscription(req, res) {
    try {
      const { userId, reason } = req.body;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      // Update subscription status
      if (user.subscription) {
        user.subscription.status = 'cancelled';
        user.subscription.cancelledAt = new Date();
        user.subscription.cancelledBy = adminId;
        user.subscription.cancellationReason = reason || 'Cancelled by admin';
        await user.save();
      }
      
      // Log the action
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: 'cancel_subscription',
        entityType: 'user',
        entityId: userId,
        metadata: {
          reason,
          previousStatus: 'active',
          newStatus: 'cancelled'
        }
      });
      
      res.json({ 
        success: true, 
        message: 'Subscription cancelled successfully' 
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to cancel subscription' 
      });
    }
  },

  // POST /api/owner/upgrade-to-premium
  async upgradeToPremium(req, res) {
    try {
      const { userId, planId, startDate, endDate } = req.body;
      const { id: adminId } = req.user;
      
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }
      
      const plans = {
        starter: { name: 'Starter', price: 149 },
        pro: { name: 'Pro', price: 349 },
        enterprise: { name: 'Enterprise', price: 999 }
      };
      
      const plan = plans[planId];
      
      if (!plan) {
        return res.status(400).json({ 
          success: false, 
          message: 'Invalid plan' 
        });
      }
      
      // Create or update subscription
      user.subscription = {
        plan: planId,
        planName: plan.name,
        price: plan.price,
        status: 'active',
        startDate: startDate || new Date(),
        endDate: endDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        upgradedBy: adminId,
        upgradedAt: new Date()
      };
      
      await user.save();
      
      // Log the action
      await ActivityLog.create({
        userId: adminId,
        userRole: req.user.role,
        action: 'admin_upgrade_user',
        entityType: 'user',
        entityId: userId,
        metadata: {
          plan: plan.name,
          price: plan.price
        }
      });
      
      res.json({ 
        success: true, 
        message: 'User upgraded to premium successfully',
        user: {
          id: user._id,
          name: user.name,
          subscription: user.subscription
        }
      });
    } catch (error) {
      console.error('Upgrade user error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to upgrade user' 
      });
    }
  }
};

module.exports = ownerUserController;