// middleware/apiResponse.js
const apiResponse = (req, res, next) => {
  // Store the original json method
  const originalJson = res.json;
  
  // Override the json method
  res.json = function(data) {
    // If data already has success field, use it
    if (data && typeof data === 'object' && 'success' in data) {
      return originalJson.call(this, data);
    }
    
    // Otherwise wrap it
    let wrappedData = {
      success: true,
      data: data
    };
    
    // If it's an error response from other middleware
    if (res.statusCode >= 400) {
      wrappedData.success = false;
      wrappedData.error = data?.message || data?.error || 'An error occurred';
    }
    
    return originalJson.call(this, wrappedData);
  };
  
  next();
};

module.exports = apiResponse;