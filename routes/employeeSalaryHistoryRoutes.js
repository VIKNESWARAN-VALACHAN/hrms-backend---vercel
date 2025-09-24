const express = require('express');
const router = express.Router();
const salaryHistoryController = require('../controllers/salaryHistoryController');

// Salary History Routes
router.get('/salary-history', salaryHistoryController.getAllSalaryHistory);
router.get('/salary-history/:employeeId', salaryHistoryController.getHistoryByEmployeeId);
router.post('/salary-history', salaryHistoryController.logSalaryChange);

module.exports = router;
