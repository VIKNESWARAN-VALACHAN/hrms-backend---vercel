const express = require('express');
const router = express.Router();
const controller = require('../controllers/employeeDependentsController');

// CRUD
router.get('/:employeeId', controller.getDependentsByEmployee);
router.post('/:employeeId', controller.createDependent);
router.put('/:id', controller.updateDependent);
router.delete('/:id', controller.deleteDependent);
// Change from:
// router.post('/bulk', controller.bulkCreateDependents);
// To:
router.post('/:employeeId/bulk', controller.bulkCreateDependents);

module.exports = router;
