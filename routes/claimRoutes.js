// routes/claimRoutes.js
const express = require('express');
const router = express.Router();
const claimController = require('../controllers/claimController');


// Claim CRUD routes
router.get('/', claimController.getAllClaims);
router.get('/:id', claimController.getClaimById);
router.get('/details/:id', claimController.getClaimDetailsById);
router.post('/', claimController.createClaim);
router.put('/:id', claimController.updateClaim);
router.delete('/:id', claimController.deleteClaim);
// Get all attachments for a claim
router.get('/:id/attachments', claimController.getClaimAttachments);

// Upload attachment
router.post('/:id/attachments', claimController.uploadAttachment);

// Download attachment
router.get('/attachments/:id/download', claimController.downloadAttachment);

// Delete attachment
router.delete('/attachments/:id', claimController.deleteAttachment);

module.exports = router;
