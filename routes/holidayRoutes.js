// const express = require('express');
// const router = express.Router();
// const holidayController = require('../controllers/holidayController');

// router.get('/holidays', holidayController.getAllHolidays);
// router.post('/holidays', holidayController.createHoliday);
// router.delete('/holidays/:id', holidayController.deleteHoliday);
// router.post('/holidays/import', holidayController.importHolidays);
// router.get('/holidays/export', holidayController.exportHolidays);

// module.exports = router;
// routes/holidayRoutes.js
const express = require('express');
const router = express.Router();
const holidayController = require('../controllers/holidayController');

router.get('/holidays', holidayController.getAllHolidays);            // supports filters
router.post('/holidays', holidayController.createHoliday);
router.put('/holidays/:id', holidayController.updateHoliday);         // NEW
router.delete('/holidays/:id', holidayController.deleteHoliday);
router.post('/holidays/import', holidayController.importHolidays);
router.get('/holidays/export', holidayController.exportHolidays);

// For modal/company filter
router.get('/companies', holidayController.listCompaniesForHolidays); // NEW

module.exports = router;
