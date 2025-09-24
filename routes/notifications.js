// routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const {
  sendBirthdayEmail,
  sendPasswordResetEmail,
  runBirthdayJobNow,
  sendLeaveTestEmail
} = require('../controllers/notifications');

// Birthday wishes
router.post('/birthday', sendBirthdayEmail);

// Password reset (send temp password)
router.post('/password-reset', sendPasswordResetEmail);

// POST /api/notifications/birthday/run
// Optional: ?date=2025-09-06 for backfill test
router.post('/birthday/run', runBirthdayJobNow); 


// dev/test route
router.post('/test/leave-email', sendLeaveTestEmail);


module.exports = router;
