const Store = require('../models/Store');

// Middleware to check if the user is the owner of the store
const isOwner = async (req, res, next) => {
  try {
    const store = await Store.findById(req.params.storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }
    if (store.owner.toString() !== req.user.id) {
      return res.status(403).json({ message: 'You are not the owner of this store' });
    }
    req.store = store;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Middleware to check if the user is a member of the store
const isMember = async (req, res, next) => {
  try {
    const store = await Store.findById(req.params.storeId);
    if (!store) {
      return res.status(404).json({ message: 'Store not found' });
    }
    const member = store.members.find(member => member.user.toString() === req.user.id);
    if (!member) {
      return res.status(403).json({ message: 'You are not a member of this store' });
    }
    req.store = store;
    req.member = member;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Middleware to check if the user has a specific role in the store
const hasRole = (roles) => {
  return async (req, res, next) => {
    try {
      const store = await Store.findById(req.params.storeId);
      if (!store) {
        return res.status(404).json({ message: 'Store not found' });
      }
      const member = store.members.find(member => member.user.toString() === req.user.id);
      if (!member || !roles.includes(member.role)) {
        return res.status(403).json({ message: `You must have one of the following roles: ${roles.join(', ')}` });
      }
      req.store = store;
      req.member = member;
      next();
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  };
};

module.exports = { isOwner, isMember, hasRole };