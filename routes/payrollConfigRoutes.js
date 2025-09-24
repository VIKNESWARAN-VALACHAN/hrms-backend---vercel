const express = require('express');
const router = express.Router();
const payrollConfigController = require('../controllers/payrollConfigController');

// Payroll Config Routes
router.get('/configs', payrollConfigController.getAllConfigs);
router.get('/configs/:id', payrollConfigController.getConfig);
router.get('/configs/:id/export', payrollConfigController.exportConfig);
router.post('/configs', payrollConfigController.createConfig);
router.put('/configs/:id', payrollConfigController.updateConfig);
router.delete('/configs/:id', payrollConfigController.deleteConfig);

module.exports = router;