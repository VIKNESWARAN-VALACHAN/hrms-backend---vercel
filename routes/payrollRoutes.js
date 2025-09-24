const express = require('express');
const router = express.Router();
const payrollController = require('../controllers/payrollController');

// Payroll Processing Routes
router.post('/process', payrollController.processPayroll);
router.get('/process/status/:month/:year', payrollController.getPayrollStatus);
router.post('/process/lock', payrollController.lockPayroll);
router.post('/process/unlock', payrollController.unlockPayroll);

module.exports = router;