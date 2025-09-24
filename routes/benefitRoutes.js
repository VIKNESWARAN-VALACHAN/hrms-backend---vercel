const express = require('express');
const router = express.Router();
const benefitController = require('../controllers/benefitController');

// Employee Benefits
router.get('/employee-benefits', benefitController.getAllEmployeeBenefits);
router.get('/employee-benefits/:id', benefitController.getEmployeeBenefitById);
router.post('/employee-benefits', benefitController.createEmployeeBenefit);
router.put('/employee-benefits/:id', benefitController.updateEmployeeBenefit);
router.delete('/employee-benefits/:id', benefitController.deleteEmployeeBenefit);

// Benefit Types
router.get('/benefit-types', benefitController.getAllBenefitTypes);
router.get('/benefit-types/:id', benefitController.getBenefitTypeById);
router.post('/benefit-types', benefitController.createBenefitType);
router.put('/benefit-types/:id', benefitController.updateBenefitType);
router.delete('/benefit-types/:id', benefitController.deleteBenefitType);

// Benefit Groups
router.get('/benefit-groups', benefitController.getAllBenefitGroups);
router.get('/benefit-groups/:id', benefitController.getBenefitGroupById);
router.post('/benefit-groups', benefitController.createBenefitGroup);
router.put('/benefit-groups/:id', benefitController.updateBenefitGroup);
router.delete('/benefit-groups/:id', benefitController.deleteBenefitGroup);

// Benefit Group Items
router.get('/benefit-group-items', benefitController.getAllBenefitGroupItems);
router.get('/benefit-group-items/:id', benefitController.getBenefitGroupItemById);
router.post('/benefit-group-items', benefitController.createBenefitGroupItem);
router.put('/benefit-group-items/:id', benefitController.updateBenefitGroupItem);
router.delete('/benefit-group-items/:id', benefitController.deleteBenefitGroupItem);

// Group Employee Mapping
router.post('/benefit-groups/:id/assign-employees', benefitController.assignEmployeesToGroup);
router.delete('/benefit-groups/:id/remove-employee/:employeeId', benefitController.removeEmployeeFromGroup);


// NEW: list only employees assigned to a group (with details)
router.get('/benefit-groups/:id/assigned-employees', benefitController.getAssignedEmployeesForGroup);

// NEW: list all employees but mark which are assigned to the group (with details)
// great for the Assign modal UX
router.get('/benefit-groups/:id/employees-with-assignment', benefitController.getEmployeesWithAssignmentForGroup);

// Employee <-> Benefit Group (single-employee convenience)
router.get('/employees/:id/benefit-group', benefitController.getEmployeeBenefitGroup);
router.put('/employees/:id/benefit-group', benefitController.updateEmployeeBenefitGroup);

module.exports = router;