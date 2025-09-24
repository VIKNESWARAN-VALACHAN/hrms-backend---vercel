const express = require('express');
const announcementController = require('../controllers/announcementController');
const { dbPromise } = require('../models/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const router = express.Router();

// Announcements
router.post('/announcements', authMiddleware, announcementController.createAnnouncement);
router.get('/announcements', authMiddleware, announcementController.getAllAnnouncements);
router.put('/announcements/:id', authMiddleware, announcementController.updateAnnouncement);
router.patch('/announcements/read', authMiddleware, announcementController.updateAnnouncementRead);
router.patch('/announcements/:id', authMiddleware, announcementController.patchAnnouncement);
router.delete('/announcements/:id', authMiddleware, announcementController.deleteAnnouncement);
router.get('/announcements/:id', authMiddleware, announcementController.getAnnouncementById);

// Announcement Documents - standard endpoints for existing implementation
router.post('/announcements/:announcement_id/documents', authMiddleware, announcementController.uploadAnnouncementDocuments);
router.get('/announcements/:announcement_id/documents', authMiddleware, announcementController.getAnnouncementDocuments);
router.delete('/announcements/:announcement_id/documents', authMiddleware, announcementController.deleteAnnouncementDocument);

// New routes for EmployeeDocumentManager compatibility
router.post('/announcements/documents/upload-request', authMiddleware, announcementController.getAnnouncementDocumentUploadUrl);
router.post('/announcements/documents', authMiddleware, announcementController.createAnnouncementDocument);
router.get('/announcements/documents/view-url', authMiddleware, announcementController.getAnnouncementDocumentViewUrl);

module.exports = router;    

