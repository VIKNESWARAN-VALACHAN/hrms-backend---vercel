const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Ensure this is your correct DB connection
const leaveController = require('../controllers/leaveController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, leaveController.getAllLeaveTypes);
router.get('/stats', authMiddleware, leaveController.getLeaveTypeStats);
router.get('/leave-types-by-employee-id', authMiddleware, leaveController.getLeaveTypesByEmployeeId);
router.get('/company/:companyId', authMiddleware, leaveController.getLeaveTypesByCompanyId);
router.post('/', authMiddleware, leaveController.createLeaveType);
router.post('/bulk/create', authMiddleware, leaveController.bulkCreateLeaveTypes);
router.put('/bulk/update', authMiddleware, leaveController.bulkUpdateLeaveTypes);
router.get('/:id', authMiddleware, leaveController.getLeaveTypeById);
router.put('/:id', authMiddleware, leaveController.updateLeaveType);
router.delete('/:id', authMiddleware, leaveController.deleteLeaveType);

module.exports = router;