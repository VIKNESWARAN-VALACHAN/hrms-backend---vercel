const express = require('express');
const router = express.Router();
const employeeBenefitController = require('../controllers/employeeBenefitController');

// ✅ Get all mappings with usage
router.get('/', employeeBenefitController.getAllMappings);

// ✅ Create single mapping
router.post('/', employeeBenefitController.createMapping);

// ✅ Update mapping
router.put('/:id', employeeBenefitController.updateMapping);

// ✅ Delete mapping
router.delete('/:id', employeeBenefitController.deleteMapping);

// ✅ Bulk create mapping
router.post('/bulk', employeeBenefitController.bulkCreateMapping);

// ✅ Group mapping by company
router.post('/group-by-company', employeeBenefitController.bulkCreateMappingByCompany);

router.get('/summary', employeeBenefitController.getBenefitSummary);

// ✅ Get benefit summary for a specific employee
router.get('/summary/:employee_id', employeeBenefitController.getEmployeeBenefitSummaryById);



module.exports = router;

