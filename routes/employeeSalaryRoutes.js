const express = require('express');
const router = express.Router();
const employeeSalaryController = require('../controllers/employeeSalaryController');

// Employee Salary Routes
router.get('/salaries', employeeSalaryController.getAllSalaries);
router.get('/salaries/:id', employeeSalaryController.getSalary);
//router.get('/employees/:employeeId/salaries', employeeSalaryController.getSalariesByEmployee);
//router.get('/employees/:employeeId/salary-history', employeeSalaryController.getSalaryHistory);
router.post('/salaries', employeeSalaryController.createSalary);
router.put('/salaries/:id', employeeSalaryController.updateSalary);
router.delete('/salaries/:id', employeeSalaryController.deleteSalary);
router.get('/salaries/export', employeeSalaryController.exportSalaries);

// Increments
router.post('/employees/:employeeId/increments', employeeSalaryController.createIncrement);
router.get('/employees/:employeeId/increments', employeeSalaryController.listIncrements);
router.delete('/employees/:employeeId/increments/:id', employeeSalaryController.deleteIncrement);

// Optional: trigger the cron logic manually (for testing)
router.post('/maintenance/sync-employee-salaries', employeeSalaryController.syncEmployeeSalariesToLatestIncrement);


module.exports = router;