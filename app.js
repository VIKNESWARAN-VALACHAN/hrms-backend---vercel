// app.js
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fileUpload = require('express-fileupload');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

// Utils
const { combineSwaggerSpecs } = require('./utils/swagger-utils');

// Controllers needed for job endpoints (safe to import even on Vercel)
const {
  publishScheduledAnnouncements,
  cleanupInactiveAnnouncements,
  expireReadAnnouncements
} = require('./controllers/announcementController');
const { runAutoEscalation } = require('./jobs/autoEscalation');
const { runRateExpiryCheck } = require('./jobs/autoRateExpiryScheduler');
const { sendLowStockAlerts, sendWarrantyAlerts } = require('./controllers/inventoryController');
const { runBenefitRenewalJob } = require('./jobs/benefitRenewal');

// App
const app = express();

// Core middleware
app.use(fileUpload());
app.use(cors());
app.use(bodyParser.json());

// ---- Swagger (robust file loading)
const swaggerRoot = path.join(__dirname, 'swagger');
function loadYamlSpec(fileName) {
  const full = path.join(swaggerRoot, fileName);
  if (!fs.existsSync(full)) {
    console.error('[Swagger] Missing file:', full);
    return null;
  }
  try {
    const spec = YAML.load(full);
    if (!spec || typeof spec !== 'object') return null;
    if (!spec.paths) spec.paths = {};
    return spec;
  } catch (e) {
    console.error('[Swagger] Failed to load', full, e.message);
    return null;
  }
}
const swaggerFiles = ['leave.yaml', 'payroll.yaml', 'inventory.yaml', 'bank-currency.yaml', 'holiday.yaml'];
const loadedSpecs = swaggerFiles.map(loadYamlSpec).filter(Boolean);
const combinedSwagger = combineSwaggerSpecs(loadedSpecs);
app.use(
  '/api-docs',
  swaggerUi.serve,
  swaggerUi.setup(combinedSwagger, {
    customSiteTitle: 'HRMS API Documentation',
    customCss: '.swagger-ui .topbar { display: none }'
  })
);

// ---- Routes (match your existing structure)
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/announcement', require('./routes/announcementRoutes'));
app.use('/api/employee', require('./routes/employeeRoutes'));
app.use('/api/leaves', require('./routes/leaveRoutes'));
app.use('/api/attendance', require('./routes/attendanceRoutes'));
app.use('/api/employees', require('./routes/employeeDocuments'));
app.use('/api/dashboard', require('./routes/dashboardRoutes'));

const adminController = require('./controllers/adminController');
app.get('/api/companies', adminController.getAllCompanies);
app.get('/api/companies/:id', adminController.getCompany);
app.get('/api/companies/:id/departments', adminController.getCompanyAllDepartments);
app.post('/api/companies/:id/departments', adminController.createDepartment);
app.delete('/api/companies/:id', adminController.deleteCompany);

app.use('/api/v1/leaves', require('./routes/leaveManagementRoutes'));
app.use('/api/v1/leave-types', require('./routes/leaveTypeRoutes'));
app.use('/api/inventory', require('./routes/inventoryRoutes'));
app.use('/api/holiday', require('./routes/holidayRoutes'));
app.use('/api/bank-currency', require('./routes/bankCurrencyRoutes'));
app.use('/api/master-data', require('./routes/masterDataRoutes'));

app.use('/api/payroll-config', require('./routes/payrollConfigRoutes'));
app.use('/api/payroll-policy-assignments', require('./routes/payrollPolicyAssignmentRoutes'));
app.use('/api/employee-salaries', require('./routes/employeeSalaryRoutes'));
app.use('/api/payroll-config-allowance', require('./routes/payrollConfigAllowanceRoutes'));
app.use('/api/payroll-config-deduction', require('./routes/payrollConfigDeductionRoutes'));

app.use('/api', require('./routes/employeeStatutoryRoutes'));
app.use('/api', require('./routes/employeeSalaryHistoryRoutes'));
app.use('/api/feedback', require('./routes/feedbackRoutes'));
app.use('/api/payroll', require('./routes/payrollCalculation'));
app.use('/api/employee-reliefs', require('./routes/employeeReliefsRoutes'));
app.use('/api/employee-allowances', require('./routes/employeeAllowanceRoutes'));
app.use('/api/employee-deductions', require('./routes/employeeDeductionRoutes'));
app.use('/api/dependents', require('./routes/employeeDependentsRoutes'));
app.use('/api/claims', require('./routes/claimRoutes'));
app.use('/api/benefits', require('./routes/benefitTypeRoutes'));
app.use('/api/employee-benefits', require('./routes/employeeBenefitRoutes'));
app.use('/api/approval', require('./routes/approvalRoutes'));
app.use('/api/approval-config', require('./routes/approvalConfigRoutes'));
app.use('/api', require('./routes/benefitRoutes'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/convert', require('./routes/officeConvertRoutes'));
app.use('/api/attendance', require('./routes/attendanceIp.routes'));
app.use('/api/schedules', require('./routes/schedulesRoutes'));

// Health
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    specsLoaded: loadedSpecs.length,
    time: new Date().toISOString()
  });
});

// Manual job endpoints (for Vercel Cron or external schedulers)
app.post('/jobs/run/publishAnnouncements', async (req, res) => {
  await publishScheduledAnnouncements();
  res.json({ ok: true });
});
app.post('/jobs/run/cleanupAnnouncements', async (req, res) => {
  await cleanupInactiveAnnouncements();
  res.json({ ok: true });
});
app.post('/jobs/run/expireReadAnnouncements', async (req, res) => {
  await expireReadAnnouncements();
  res.json({ ok: true });
});
app.post('/jobs/run/autoEscalation', async (req, res) => {
  await runAutoEscalation();
  res.json({ ok: true });
});
app.post('/jobs/run/expireRates', async (req, res) => {
  await runRateExpiryCheck();
  res.json({ ok: true });
});
app.post('/jobs/run/inventoryAlerts', async (req, res) => {
  await sendLowStockAlerts();
  await sendWarrantyAlerts();
  res.json({ ok: true });
});
app.post('/jobs/run/benefitRenewal', async (req, res) => {
  const processedBy = (req.body && req.body.processed_by) || 'system';
  const jobType = (req.body && req.body.job_type) || 'manual';
  await runBenefitRenewalJob(processedBy, jobType);
  res.json({ ok: true });
});

// Cron schedules: only start when running as a long-lived process (not on Vercel)
if (!process.env.VERCEL) {
  const cron = require('node-cron');

  // Lazy requires inside schedules to avoid heavy imports at startup on serverless
  cron.schedule('* * * * *', async () => {
    console.log('[cron] publishScheduledAnnouncements');
    await publishScheduledAnnouncements();
  });

  // Mark absent employees hourly 13-23 Mon–Fri
  cron.schedule(
    '0 13-23 * * 1-5',
    async () => {
      console.log('[cron] markAbsentEmployees');
      const attendanceController = require('./controllers/attendanceController');
      await attendanceController.markAbsentEmployees();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Mark employees on leave daily 00:01
  cron.schedule(
    '1 0 * * *',
    async () => {
      console.log('[cron] markLeaveEmployees');
      const attendanceController = require('./controllers/attendanceController');
      await attendanceController.markLeaveEmployees();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Cleanup inactive + update leave balance daily 00:00
  cron.schedule(
    '0 0 * * *',
    async () => {
      console.log('[cron] cleanupInactiveAnnouncements + updateLeaveBalanceJob');
      await cleanupInactiveAnnouncements();
      const leaveController = require('./controllers/leaveController');
      await leaveController.updateLeaveBalanceJob();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Expire fully-read announcements daily 01:00
  cron.schedule(
    '0 1 * * *',
    async () => {
      console.log('[cron] expireReadAnnouncements');
      const announcementController = require('./controllers/announcementController');
      await announcementController.expireReadAnnouncements();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Auto escalation hourly
  cron.schedule(
    '0 * * * *',
    async () => {
      console.log('[cron] runAutoEscalation');
      await runAutoEscalation();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Expire outdated currency rates daily 00:05
  cron.schedule(
    '5 0 * * *',
    async () => {
      console.log('[cron] runRateExpiryCheck');
      await runRateExpiryCheck();
    },
    { timezone: 'Asia/Singapore' }
  );

  // Inventory alerts daily 09:00
  cron.schedule('0 9 * * *', async () => {
    console.log('[cron] inventory alerts');
    await sendLowStockAlerts();
    await sendWarrantyAlerts();
  });

  // Benefit renewal daily 00:05
  cron.schedule(
    '5 0 * * *',
    async () => {
      console.log('[cron] runBenefitRenewalJob');
      await runBenefitRenewalJob('system', 'scheduled');
    },
    { timezone: 'Asia/Singapore' }
  );

  // One-time schedulers that set themselves up
  require('./jobs/birthdayScheduler');
  require('./jobs/positionSync');
  require('./jobs/salarySync');
  require('./jobs/payrollJobScheduler');
}

// Error handler (keep last)
app.use(require('./middleware/errorHandler'));

module.exports = app;
