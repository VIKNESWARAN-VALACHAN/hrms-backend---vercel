const express = require('express');
const router = express.Router();
const feedbackController = require('../controllers/feedbackController');
const multer = require('multer');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, uniqueName);
  }
});
const upload = multer({ storage });


// ===== Staff Endpoints =====
//router.post('/submit', feedbackController.submitFeedback);
router.post('/submit',feedbackController.submitFeedback);
router.get('/my-feedbacks/:staffId', feedbackController.getStaffFeedbacks);
router.get('/my-feedbacks/:staffId/:id', feedbackController.getSingleFeedback);
router.get('/details/:id', feedbackController.getFeedbackDetails);
router.put('/my-feedbacks/:staffId/edit/:id', feedbackController.editOwnFeedback);

// ===== Admin Panel =====
router.get('/all', feedbackController.getAllFeedbacks);
router.put('/reroute/:id', feedbackController.rerouteFeedback);
router.get('/respond/:id', feedbackController.getResponses);
router.post('/respond/:id', feedbackController.addResponse);
router.put('/update/:id', feedbackController.updateFeedbackInline);
router.get('/logs/:id', feedbackController.getFeedbackLogs);
router.get('/export', feedbackController.exportFeedbacks);
router.put('/change-status/:id', feedbackController.changeStatus);

// ===== PIC Configuration =====
router.get('/pic-config', feedbackController.getPicConfigs);
router.post('/pic-config', feedbackController.addPicConfig);
router.put('/pic-config/:id', feedbackController.updatePicConfig);
router.delete('/pic-config/:id', feedbackController.deletePicConfig);

// ===== Admin Settings =====
router.get('/settings', feedbackController.getSettings);
router.put('/settings', feedbackController.updateSettings);

// ===== Dashboard & Analytics =====
router.get('/dashboard/heatmap', feedbackController.getHeatmapStats);
router.get('/dashboard/metrics', feedbackController.getSlaMetrics);
router.get('/dashboard/trends', feedbackController.getKeywordTrends);
router.get('/dashboard/monthly-report', feedbackController.getMonthlyReport);
//Feedback Dashboard Page
router.get('/stats', feedbackController.getDashboardStats);

// ===== Master Data Management =====
router.get('/master/sections', feedbackController.getSections);
router.post('/master/sections', feedbackController.createSection);
router.put('/master/sections/:id', feedbackController.updateSection);
router.delete('/master/sections/:id', feedbackController.deleteSection);

router.get('/master/categories', feedbackController.getCategories);
router.post('/master/categories', feedbackController.createCategory);
router.put('/master/categories/:id', feedbackController.updateCategory);
router.delete('/master/categories/:id', feedbackController.deleteCategory);

router.get('/master/feedback-types', feedbackController.getFeedbackTypes);
router.post('/master/feedback-types', feedbackController.createFeedbackType);
router.put('/master/feedback-types/:id', feedbackController.updateFeedbackType);
router.delete('/master/feedback-types/:id', feedbackController.deleteFeedbackType);

router.get('/master/status', feedbackController.getStatusList);
router.post('/master/status', feedbackController.createStatus);
router.put('/master/status/:id', feedbackController.updateStatus);
router.delete('/master/status/:id', feedbackController.deleteStatus);

router.get('/master/priority-levels', feedbackController.getPriorityLevels);
router.post('/master/priority-levels', feedbackController.createPriorityLevel);
router.put('/master/priority-levels/:id', feedbackController.updatePriorityLevel);
router.delete('/master/priority-levels/:id', feedbackController.deletePriorityLevel);


// Assign a PIC to a feedback (manual assignment)
router.post('/assign-pic', feedbackController.assignPIC);

// Trigger escalation check (can be called via backend, cron, or manually)
router.post('/check-escalations', feedbackController.runEscalationNow);



module.exports = router;
