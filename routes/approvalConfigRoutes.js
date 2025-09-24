const express = require('express');
const router = express.Router();
const approvalConfigController = require('../controllers/approvalConfigController');

router.get('/', approvalConfigController.getApprovalConfig);         // GET ?module=claim&company_id=1
router.post('/', approvalConfigController.createApprovalConfig);     // POST body: { module, company_id, final_level }
router.put('/:id', approvalConfigController.updateApprovalConfig);   // PUT body: { final_level }
router.delete('/:id', approvalConfigController.deleteApprovalConfig); // DELETE by ID


module.exports = router;
