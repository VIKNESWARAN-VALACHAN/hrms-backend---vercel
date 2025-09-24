const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/authMiddleware');

const offices = require('../controllers/offices.controller');
const officeIps = require('../controllers/officeIpWhitelists.controller');
const empIps = require('../controllers/employeeIpOverrides.controller');
const ipPolicy = require('../controllers/ipPolicy.controller');
const empOffice = require('../controllers/employeesOffice.controller');
const ipDeviceInfo = require('./ipDeviceInfo');

// Company > Offices
router.get('/offices', authMiddleware, offices.list);
router.post('/offices', authMiddleware, offices.create);
router.put('/offices/:id', authMiddleware, offices.update);
router.delete('/offices/:id', authMiddleware, offices.remove);

// Office > IP Whitelist
router.get('/office-ip-whitelists', authMiddleware, officeIps.list);         // ?office_id=#
router.post('/office-ip-whitelists', authMiddleware, officeIps.create);
router.put('/office-ip-whitelists/:id', authMiddleware, officeIps.update);
router.delete('/office-ip-whitelists/:id', authMiddleware, officeIps.remove);

// Employee > Assign Office
router.put('/employees/:id/office', authMiddleware, empOffice.assignOffice);

// Employee > IP Overrides
router.get('/employee-ip-overrides', authMiddleware, empIps.listByEmployee); // ?employee_id=#
router.post('/employee-ip-overrides', authMiddleware, empIps.create);
router.delete('/employee-ip-overrides/:id', authMiddleware, empIps.remove);

// Settings > Attendance IP Policy
router.get('/ip-policy', authMiddleware, ipPolicy.get);
router.put('/ip-policy', authMiddleware, ipPolicy.upsert);
router.delete('/ip-policy', authMiddleware, ipPolicy.remove); 

// Alias for compatibility
router.get('/policy', authMiddleware, ipPolicy.get);
router.put('/policy', authMiddleware, ipPolicy.upsert);
router.delete('/policy', authMiddleware, ipPolicy.remove); 

// IP & Device Information Routes
router.use(ipDeviceInfo);

module.exports = router;
