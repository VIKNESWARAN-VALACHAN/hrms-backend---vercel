const express = require('express');
const router = express.Router();

// Import controllers
const allowanceMasterController = require('../controllers/allowanceMasterController');
const deductionMasterController = require('../controllers/deductionMasterController');
const reliefCategoriesController = require('../controllers/reliefCategoriesController');
const versionControlController = require('../controllers/versionControlController');

// Import Contribution controllers

const epfContributionController = require('../controllers/epfContributionController');
const socsoContributionController = require('../controllers/socsoContributionController');
const eisContributionController = require('../controllers/eisContributionController');
const pcbTaxController = require('../controllers/pcbTaxController');


// Allowance Master Routes
router.get('/allowances', allowanceMasterController.getAllAllowances);
router.get('/allowances/:id', allowanceMasterController.getAllowance);
router.post('/allowances', versionControlController.logChangesMiddleware, allowanceMasterController.createAllowance);
router.put('/allowances/:id', versionControlController.logChangesMiddleware, allowanceMasterController.updateAllowance);
router.delete('/allowances/:id', allowanceMasterController.deleteAllowance);
router.get('/allowances/export', allowanceMasterController.exportAllowances);

// Deduction Master Routes
router.get('/deductions', deductionMasterController.getAllDeductions);
router.get('/deductions/:id', deductionMasterController.getDeduction); 
router.post('/deductions', versionControlController.logChangesMiddleware, deductionMasterController.createDeduction);
router.put('/deductions/:id', versionControlController.logChangesMiddleware, deductionMasterController.updateDeduction);
router.delete('/deductions/:id', deductionMasterController.deleteDeduction);
router.get('/deductions/export', deductionMasterController.exportDeductions);

router.get('/deductions/statutory', deductionMasterController.getStatutoryDeductions);
router.get('/deductions/non-statutory', deductionMasterController.getNonStatutoryDeductions);


// Relief Categories Routes
router.get('/reliefs', reliefCategoriesController.getAllReliefs);
// router.post('/reliefs', reliefCategoriesController.createRelief);
// router.put('/reliefs/:id', reliefCategoriesController.updateRelief);
router.post('/reliefs', versionControlController.logChangesMiddleware, reliefCategoriesController.createRelief);
router.put('/reliefs/:id', versionControlController.logChangesMiddleware, reliefCategoriesController.updateRelief);
router.patch('/reliefs/:id/toggle', reliefCategoriesController.toggleReliefStatus);
router.get('/reliefs/export', reliefCategoriesController.exportReliefs);
router.delete('/reliefs/:id', reliefCategoriesController.deleteRelief);

// EPF Contribution Table
router.get('/epf', epfContributionController.getAllEPF);
router.get('/epf/:id', epfContributionController.getEPF);
router.post('/epf', versionControlController.logChangesMiddleware, epfContributionController.createEPF);
router.put('/epf/:id', versionControlController.logChangesMiddleware, epfContributionController.updateEPF);
router.delete('/epf/:id', epfContributionController.deleteEPF);
router.get('/epf/export', epfContributionController.exportEPF);

// SOCSO Contribution Table
router.get('/socso', socsoContributionController.getAllSOCSO);
router.get('/socso/:id', socsoContributionController.getSOCSO);
router.post('/socso', versionControlController.logChangesMiddleware, socsoContributionController.createSOCSO);
router.put('/socso/:id', versionControlController.logChangesMiddleware, socsoContributionController.updateSOCSO);
router.delete('/socso/:id', socsoContributionController.deleteSOCSO);
router.get('/socso/export', socsoContributionController.exportSOCSO);

// EIS Contribution Table
router.get('/eis', eisContributionController.getAllEIS);
router.get('/eis/:id', eisContributionController.getEIS);
router.post('/eis', versionControlController.logChangesMiddleware, eisContributionController.createEIS);
router.put('/eis/:id', versionControlController.logChangesMiddleware, eisContributionController.updateEIS);
router.delete('/eis/:id', eisContributionController.deleteEIS);
router.get('/eis/export', eisContributionController.exportEIS);


// PCB Tax Table
router.get('/pcb', pcbTaxController.getAllPCB);
router.get('/pcb/:id', pcbTaxController.getPCB);
router.post('/pcb', versionControlController.logChangesMiddleware, pcbTaxController.createPCB);
router.put('/pcb/:id', versionControlController.logChangesMiddleware, pcbTaxController.updatePCB);
router.delete('/pcb/:id', pcbTaxController.deletePCB);
//router.get('/pcb/export', pcbTaxController.exportPCB);


// Version Control Routes
router.get('/version-logs', versionControlController.getVersionLogs);

module.exports = router;