// routes/benefitTypeRoutes.js
const express = require('express');
const router = express.Router();
const benefitTypeController = require('../controllers/benefitTypeController');

router.get('/', benefitTypeController.getAllBenefitTypes);
router.get('/:id', benefitTypeController.getBenefitType);
router.post('/', benefitTypeController.createBenefitType);
router.put('/:id', benefitTypeController.updateBenefitType);
router.delete('/:id', benefitTypeController.deleteBenefitType);

module.exports = router;
