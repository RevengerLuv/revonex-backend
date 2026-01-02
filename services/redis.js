// Lightweight Redis service stub for development.
// Provides the minimal interface used by masterOwnerController:
// - ping()
// - keys(pattern)
// - del(keyPattern)
//
// In production, replace this with a real Redis client implementation.

module.exports = {
  async ping() {
    // Simulate a healthy Redis instance
    return 'PONG';
  },

  async keys(pattern) {
    // No sessions stored in this stub; always return empty list
    return [];
  },

  async del(keyPattern) {
    // Pretend we deleted some keys
    return 1;
  },
};
