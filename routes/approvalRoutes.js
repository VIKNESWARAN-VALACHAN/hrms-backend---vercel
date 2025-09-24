const express = require('express');
const router = express.Router();
const approvalController = require('../controllers/approvalController');

// GET /api/approval-history?module=claim&record_id=123
router.get('/approval-history', approvalController.getApprovalHistoryDetails);
router.post('/claims/:id/approve', approvalController.approveClaim);
router.post('/claims/:id/reject', approvalController.rejectClaim);
router.get('/claims/:id/approval-history', approvalController.getApprovalHistory);
router.get('/claims/:id/approval-status', approvalController.getCurrentApprovalStatus);
router.get('/claims/:id', approvalController.getClaimDetails);

module.exports = router;
