// routes/schedulesRoutes.js
const express = require('express');
const router = express.Router();

const schedules = require('../controllers/schedulesController');

// Read schedules by range
router.get('/', schedules.getByRange);

// Bulk upsert month/range from UI
router.post('/bulk',  schedules.bulkUpsert);

// Templates CRUD
router.get('/templates', schedules.listTemplates);
router.post('/templates', schedules.createTemplate);
router.put('/templates/:id', schedules.updateTemplate);
router.delete('/templates/:id',  schedules.deleteTemplate);

// Patterns CRUD
router.get('/patterns', schedules.listPatterns);
router.post('/patterns',  schedules.createPattern);
router.put('/patterns/:id',  schedules.updatePattern);
router.delete('/patterns/:id', schedules.deletePattern);

module.exports = router;
