const express = require('express');
const router = express.Router();
const autoRenewalController = require('../controllers/autoRenewalController');

// ✅ Process all auto-renewals
router.post('/auto-renew', (req, res) => {
    autoRenewalController.processAutoRenewals(req, res);
});


// ✅ Get renewal preview (dry run)
router.get('/auto-renew/preview', (req, res) => {
    autoRenewalController.getRenewalPreview(req, res);
});

// ✅ Process renewals for a specific employee
router.post('/auto-renew/employee/:employeeId', (req, res) => {
    autoRenewalController.processEmployeeRenewals(req, res);
});

// ✅ Get benefits due for renewal
router.get('/auto-renew/due', (req, res) => {
    autoRenewalController.getBenefitsDueForRenewal(req, res);
});

// ✅ Manual renewal of a specific benefit
router.post('/auto-renew/manual/:benefitId', (req, res) => {
    autoRenewalController.manualRenewal(req, res);
});

module.exports = router;

