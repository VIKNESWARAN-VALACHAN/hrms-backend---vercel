const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.get('/today-count', authMiddleware, dashboardController.getTodayAttendanceCount);
router.get('/pending-leaves', authMiddleware, dashboardController.getPendingLeavesCount);
router.get('/pending-appeals', authMiddleware, dashboardController.getPendingAppealsCount);
router.get('/document-status', dashboardController.getDocumentStatusSummary);
router.get('/document-status/details', dashboardController.getEmployeesWithDocumentStatus);


module.exports = router;