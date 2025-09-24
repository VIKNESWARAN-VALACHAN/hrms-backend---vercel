const express = require('express');
const payrollController = require('../controllers/payrollCalculationController');
const router = express.Router();


// Payroll field updates with version saving and recalculation
router.patch('/:id', payrollController.updatePayrollField);
//Manual Payslip Adjustment
router.post('/adjustments', payrollController.adjustPayslipItem);
//router.patch('/:id', payrollController.updatePayrollField);

router.post('/preview', payrollController.previewPayroll);
router.post('/generate', payrollController.generatePayroll);
router.get('/joblogs', payrollController.getPayrollJobLogs);
router.get('/jobconfig', payrollController.getJobConfig);
router.put('/jobconfig', payrollController.updateJobConfig);

// Adjustment Tab Routes
//router.get('/adjustments', payrollController.getPayrollList);
router.get('/adjustments', payrollController.getPayrollAdjustments);
router.get('/adjustments/monthly', payrollController.getPayrollListByMonth);
router.get('/adjustments/:id/versions', payrollController.getPayrollVersions);
router.post('/adjustments/:id/rollback', payrollController.rollbackPayroll);

router.get('/:id/versions', payrollController.getPayrollVersions);
router.post('/payroll/:id/rollback/:version', payrollController.rollbackPayroll);




// Test run of payroll background job
router.post('/payroll/job/test', payrollController.runPayrollJobTest);
router.get('/employee/:employeeId', payrollController.getEmployeePayslips);
router.get('/employee/:employee_id', payrollController.getPayrollsByEmployee);
router.get('/:id', payrollController.getPayrollDetail);
router.post('/status', payrollController.updatePayrollStatus);


router.post('/reorder', payrollController.reorderPayroll);

// Routes for Payslip Comments
router.post('/comments', payrollController.addPayslipComment); // Assuming this route exists based on your controller code
router.get('/:payroll_id/comments', payrollController.getPayslipComments); // Assuming this route exists
router.put('/comments/:id', payrollController.updatePayslipComment);
router.delete('/comments/:id', payrollController.deletePayslipComment);


//export
router.get('/:id/export', payrollController.exportPayrollWithComments);
router.get('/export/monthly', payrollController.exportPayrollByMonthWithComments);

router.post('/import', payrollController.uploadPayrollExcel);
router.get('/:id/audit-log', payrollController.getAuditLog);

module.exports = router;
//routes\payrollCalculation.js