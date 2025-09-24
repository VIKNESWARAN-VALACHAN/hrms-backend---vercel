const express = require('express');
const { login, refreshToken, updateEmployeePassword, verifyToken } = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');
const router = express.Router();

/**
 * Auth routes
 * /api/auth/...
 */

// Public routes (no authentication required)
router.post('/login', login);
router.post('/refresh-token', refreshToken);

// Protected routes (require authentication)
router.post('/update-password', authMiddleware, updateEmployeePassword);
router.get('/verify', authMiddleware, verifyToken);

module.exports = router;
