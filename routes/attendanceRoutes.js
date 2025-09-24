const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/attendanceController');
const { authMiddleware } = require('../middleware/authMiddleware');
const { ipGate } = require('../middleware/ipGate');

// Check-in endpoint
router.post('/check-in', authMiddleware,ipGate(), attendanceController.checkIn);

// Check-out endpoint
router.post('/check-out', authMiddleware,ipGate(), attendanceController.checkOut);

// Get today's attendance
router.get('/today', authMiddleware, attendanceController.getTodayAttendance);

// Get attendance history
router.get('/history', authMiddleware, attendanceController.getAttendanceHistory);

// Get attendance statistics
router.get('/stats', authMiddleware, attendanceController.getAttendanceStats);

// Get attendance data with filters
router.get('/attendances', authMiddleware, attendanceController.getAttendances);

// Get department attendance statistics
router.get('/department', authMiddleware, attendanceController.departmentAttendance);

router.patch('/amendment', authMiddleware, attendanceController.updateAmendment);

router.post('/appeal', authMiddleware, attendanceController.submitAppeal);

router.patch('/appeal', authMiddleware, attendanceController.updateAppeal);

router.patch('/appeals/bulk', authMiddleware, attendanceController.bulkUpdateAppeals);//NEW

router.get('/appeal', authMiddleware, attendanceController.getAppeals);

// Employee appeal routes
router.post('/appeal/cancel', authMiddleware, attendanceController.cancelAppeal);
router.patch('/appeal/edit', authMiddleware, attendanceController.editAppeal);

module.exports = router;
