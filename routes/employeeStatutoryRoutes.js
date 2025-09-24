const express = require('express');
const router = express.Router();
const employeeStatutoryController = require('../controllers/employeeStatutoryController');

// Employee Statutory Config Routes
router.get('/statutory', employeeStatutoryController.getAllStatutoryConfigs);
router.get('/statutory/:employeeId', employeeStatutoryController.getStatutoryByEmployeeId);
router.post('/statutory', employeeStatutoryController.createStatutoryConfig);
router.put('/statutory/:employeeId', employeeStatutoryController.updateStatutoryConfig);
router.delete('/statutory/:employeeId', employeeStatutoryController.deleteStatutoryConfig);

module.exports = router;
