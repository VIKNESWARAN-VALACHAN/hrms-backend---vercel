const express = require('express');
const router = express.Router();
const controller = require('../controllers/employeeAllowanceController');

// List all allowances for all or filtered by employee_id
router.get('/', controller.list);

// Get single allowance by ID
router.get('/:id', controller.get);

router.get('/:employeeId/allowances', controller.listForEmployee);

// Create new allowance
router.post('/', controller.create);

// Update allowance by ID
router.put('/:id', controller.update);

// Delete allowance by ID
router.delete('/:id', controller.remove);

module.exports = router;
