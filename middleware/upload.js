// const multer = require('multer');
// const path = require('path');

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, 'uploads/'); // folder to store uploads
//   },
//   filename: (req, file, cb) => {
//     const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
//     cb(null, uniqueName);
//   }
// });

// const upload = multer({ storage });

// module.exports = upload;

// middleware/upload.js
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const isVercel = !!process.env.VERCEL;

// For Vercel: keep files in memory (Buffer in req.file.buffer) or write to /tmp
let storage;

if (isVercel) {
  storage = multer.memoryStorage();
} else {
  // Long-lived hosts: save to ./uploads
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadsDir, { recursive: true });

  storage = multer.diskStorage({
    destination: function (_req, _file, cb) {
      cb(null, uploadsDir);
    },
    filename: function (_req, file, cb) {
      const safe = file.originalname.replace(/[^\w.\-]+/g, '_');
      cb(null, `${Date.now()}_${safe}`);
    }
  });
}

const upload = multer({
  storage,
  limits: {
    fileSize: 20 * 1024 * 1024 // 20MB example
  }
});

module.exports = { upload, isVercel };
