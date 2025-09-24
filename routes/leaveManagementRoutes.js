// const express = require('express');
// const router = express.Router();
// const db = require('../models/db'); // Ensure this is your correct DB connection
// const leaveController = require('../controllers/leaveController');
// const { authMiddleware } = require('../middleware/authMiddleware');

// router.get('/', authMiddleware, leaveController.getAllLeaves);
// router.get('/leaves-by-employee-id', authMiddleware, leaveController.getAllLeavesByEmployeeId);
// router.get('/leaves-for-calendar-by-employee-id', authMiddleware, leaveController.getLeavesForCalendarByEmployeeId);
// router.get('/recent-leaves', authMiddleware, leaveController.getRecentLeaves);
// router.get('/balance', authMiddleware, leaveController.getLeaveBalance);
// router.get('/calendar', authMiddleware, leaveController.getLeaveCalendar);
// router.get('/notifications', authMiddleware, leaveController.getLeaveNotifications);
// router.get('/download-attachment/:id', authMiddleware, leaveController.downloadAttachment);

// router.get('/:id', authMiddleware, leaveController.getLeaveById);
// router.get('/:id/documents', authMiddleware, leaveController.getLeaveDocumentsByLeaveApplicationId);
// router.post('/:id/cancel', authMiddleware, leaveController.cancelLeave);

// router.post('/', authMiddleware, leaveController.createLeave);
// router.post('/admin', authMiddleware, leaveController.adminCreateLeave);
// router.post('/:id/approve', authMiddleware, leaveController.approveLeave);
// router.post('/:id/reject', authMiddleware, leaveController.rejectLeave);
// router.post('/:id/documents', authMiddleware, leaveController.uploadLeaveDocuments);

// router.put('/notifications/:id/status', authMiddleware, leaveController.updateNotificationStatus);
// router.put('/:id', authMiddleware, leaveController.updateLeave);
// router.put('/admin/:id', authMiddleware, leaveController.adminUpdateLeave);
// // Generate sample leave applications
// router.post('/generate-sample', authMiddleware, leaveController.generateSampleLeaves);
// router.get('/:company_id/update-leave-balance-by-company-id', authMiddleware,leaveController.updateLeaveBalanceJobByCompanyId);
// router.get('/:employee_id/update-leave-balance-by-employee-id', authMiddleware,leaveController.updateLeaveBalanceByEmployeeId);

// module.exports = router;

// NEW

const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Ensure this is your correct DB connection
const leaveController = require('../controllers/leaveController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/', authMiddleware, leaveController.getAllLeaves);
router.get('/leaves-by-employee-id', authMiddleware, leaveController.getAllLeavesByEmployeeId);
router.get('/leaves-for-calendar-by-employee-id', authMiddleware, leaveController.getLeavesForCalendarByEmployeeId);
router.get('/recent-leaves', authMiddleware, leaveController.getRecentLeaves);
router.get('/balance', authMiddleware, leaveController.getLeaveBalance);
router.get('/calendar', authMiddleware, leaveController.getLeaveCalendar);
router.get('/notifications', authMiddleware, leaveController.getLeaveNotifications);
router.get('/download-attachment/:id', authMiddleware, leaveController.downloadAttachment);

router.get('/:id', authMiddleware, leaveController.getLeaveById);
router.get('/:id/documents', authMiddleware, leaveController.getLeaveDocumentsByLeaveApplicationId);
router.post('/:id/cancel', authMiddleware, leaveController.cancelLeave);
router.post('/:id/withdraw', authMiddleware, leaveController.withdrawLeave);

router.post('/', authMiddleware, leaveController.createLeave);
router.post('/admin', authMiddleware, leaveController.adminCreateLeave);
router.post('/:id/approve', authMiddleware, leaveController.approveLeave);
router.post('/:id/reject', authMiddleware, leaveController.rejectLeave);
router.post('/:id/reject-approved', authMiddleware, leaveController.rejectApprovedLeave);
router.post('/:id/documents', authMiddleware, leaveController.uploadLeaveDocuments);

router.put('/notifications/:id/status', authMiddleware, leaveController.updateNotificationStatus);
router.put('/:id', authMiddleware, leaveController.updateLeave);
router.put('/admin/:id', authMiddleware, leaveController.adminUpdateLeave);
// Generate sample leave applications
router.post('/generate-sample', authMiddleware, leaveController.generateSampleLeaves);
router.get('/:company_id/update-leave-balance-by-company-id', authMiddleware,leaveController.updateLeaveBalanceJobByCompanyId);
router.get('/:employee_id/update-leave-balance-by-employee-id', authMiddleware,leaveController.updateLeaveBalanceByEmployeeId);

router.get('/history/range', authMiddleware, leaveController.getLeaveHistoryRange);

module.exports = router;
