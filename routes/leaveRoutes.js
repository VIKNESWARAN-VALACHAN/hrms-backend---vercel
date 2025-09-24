const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Ensure this is your correct DB connection
const employeeController = require('../controllers/employeeController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/leaves', authMiddleware, employeeController.fetchLeaves);

module.exports = router;
