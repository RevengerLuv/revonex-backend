const multer = require('multer');
const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');

// Create GridFS storage engine
const storage = new multer.memoryStorage();

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware to handle GridFS upload
exports.uploadToGridFS = async (req, res, next) => {
  if (!req.file) return next();
  
  const conn = mongoose.connection;
  const bucket = new GridFSBucket(conn.db, { bucketName: 'uploads' });
  
  const uploadStream = bucket.openUploadStream(req.file.originalname, {
    contentType: req.file.mimetype
  });
  
  uploadStream.end(req.file.buffer);
  
  uploadStream.on('finish', () => {
    req.file.id = uploadStream.id;
    req.file.url = `/api/files/${uploadStream.id}`;
    next();
  });
  
  uploadStream.on('error', (err) => {
    console.error('GridFS upload error:', err);
    return res.status(500).json({ error: 'Failed to upload file' });
  });
};

module.exports = upload;