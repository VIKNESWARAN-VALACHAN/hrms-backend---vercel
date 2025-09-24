// routes/ipDeviceInfo.js (MINIMAL WORKING VERSION)
const express = require('express');
const router = express.Router();

// Working IP detection endpoint
router.get('/ip-device-info', (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for']?.split(',')[0] || 
               req.headers['x-real-ip'] || 
               req.ip || 
               'Unknown';
               
    res.json({
      success: true,
      ip: ip,
      userAgent: req.headers['user-agent'] || 'Unknown',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/ip-device-info/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

module.exports = router;