const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const cron = require('node-cron');
const db = require('./models/db');
const fs = require('fs');
const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load('./swagger/leave.yaml');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const leaveRoutes = require('./routes/leaveRoutes'); 
const attendanceRoutes = require('./routes/attendanceRoutes');
const employeeDocuments = require('./routes/employeeDocuments');
const leaveManagementRoutes = require('./routes/leaveManagementRoutes'); 
const leaveTypeRoutes = require('./routes/leaveTypeRoutes'); 
const dashboardRoutes = require('./routes/dashboardRoutes');
const authMiddleware = require('./middleware/authMiddleware');
const { getCompany, getCompanyAllDepartments, deleteCompany, getAllCompanies, createDepartment } = require('./controllers/adminController');
const fileUpload = require('express-fileupload');
const {publishScheduledAnnouncements, cleanupInactiveAnnouncements} = require('./controllers/announcementController');
const announcementRoutes = require('./routes/announcementRoutes');
const { runAutoEscalation } = require('./jobs/autoEscalation');
const { runRateExpiryCheck } = require('./jobs/autoRateExpiryScheduler');
const errorHandler = require('./middleware/errorHandler');
const { sendLowStockAlerts, sendWarrantyAlerts } = require('./controllers/inventoryController');
const { renewalJob } = require('./jobs/autoRenewalScheduler');

const app = express();
app.use(fileUpload());

app.use(cors());
app.use(bodyParser.json());

const { combineSwaggerSpecs } = require('./utils/swagger-utils'); 

const loadYamlSpec = (filePath) => {
  // Validate input is a string
  if (typeof filePath !== 'string') {
    console.error('Invalid path type:', typeof filePath, filePath);
    return null;
  }

  // Resolve full path
  const fullPath = path.resolve(__dirname, filePath);
  
  // Verify file exists
  if (!fs.existsSync(fullPath)) {
    console.error('File not found:', fullPath);
    return null;
  }

  try {
    // Load the YAML file
    const spec = YAML.load(fullPath);
    
    // Validate basic OpenAPI structure
    if (!spec || typeof spec !== 'object') {
      console.error('Invalid YAML content in:', fullPath);
      return null;
    }
    
    // Ensure required OpenAPI fields exist
    if (!spec.openapi || !spec.info || !spec.paths) {
      console.error('Missing required OpenAPI fields in:', fullPath);
      spec.paths = spec.paths || {}; // Ensure paths exists
    }
    
    return spec;
  } catch (err) {
    console.error(`Failed to load ${fullPath}:`, err.message);
    return null;
  }
};

const specFiles = [
  './swagger/leave.yaml',
  './swagger/payroll.yaml',
  './swagger/inventory.yaml',
  './swagger/bank-currency.yaml',
  './swagger/holiday.yaml'
];

const specs = specFiles.map(file => {
  console.log(`Loading Swagger spec from ${file}`);
  return loadYamlSpec(file);
});

const validSpecs = specs.filter(spec => spec && spec.paths);
if (validSpecs.length === 0) {
  console.error('No valid Swagger specs found!');
  process.exit(1);
}

console.log(`Successfully loaded ${validSpecs.length}/${specFiles.length} Swagger specs`);
const combinedSwagger = combineSwaggerSpecs(validSpecs);


app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/announcement', announcementRoutes);
app.use('/api/employee', employeeRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/employees', employeeDocuments);
app.use('/api/dashboard', dashboardRoutes);


app.get('/api/companies', getAllCompanies);
app.get('/api/companies/:id', getCompany);
app.get('/api/companies/:id/departments', getCompanyAllDepartments);
app.post('/api/companies/:id/departments', createDepartment);
app.delete('/api/companies/:id', deleteCompany);

app.use('/api/v1/leaves', leaveManagementRoutes);
app.use('/api/v1/leave-types', leaveTypeRoutes);

const inventoryRoutes = require('./routes/inventoryRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const bankCurrencyRoutes = require('./routes/bankCurrencyRoutes');


const options = {
  customSiteTitle: "HRMS API Documentation",
  customCss: '.swagger-ui .topbar { display: none }'
};
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(combinedSwagger, options));


// Set up cron job to check for scheduled announcements every minute
cron.schedule('* * * * *', () => {
  console.log('Checking for scheduled announcements...');
  publishScheduledAnnouncements();
});

// Set up cron job to mark absent employees - runs hourly from 1 PM to 11 PM every day
// The function now only marks employees as absent if their end work time has passed
cron.schedule('0 13-23 * * 1-5', () => {
  console.log('Running scheduled job: Mark absent employees');
  const attendanceController = require('./controllers/attendanceController');
  attendanceController.markAbsentEmployees();
}, {
  timezone: "Asia/Singapore"
});

// Set up cron job to mark employees on approved leave as OFFDAY at 12:01 AM Singapore time (daily)
cron.schedule('1 0 * * *', () => {
  console.log('Running scheduled job: Mark employees on leave');
  const attendanceController = require('./controllers/attendanceController');
  attendanceController.markLeaveEmployees();
}, {
  timezone: "Asia/Singapore"
});

// Set up cron job to clean up inactive announcements at 12:00 AM Singapore time (daily)
cron.schedule('0 0 * * *', () => {
  console.log('Running scheduled job: Clean up inactive announcements');
  cleanupInactiveAnnouncements();
  const leaveController = require('./controllers/leaveController');
  leaveController.updateLeaveBalanceJob();
}, {
  timezone: "Asia/Singapore"
});

// Set up cron job to expire announcements that have been read by all employees
// Runs at 1:00 AM Singapore time (daily)
cron.schedule('0 1 * * *', () => {
  console.log('Running scheduled job: Expire fully-read announcements');
  const announcementController = require('./controllers/announcementController');
  announcementController.expireReadAnnouncements();
}, {
  timezone: "Asia/Singapore"
});

// Auto escalation job - runs every hour
cron.schedule('0 * * * *', () => {
  console.log('Running auto escalation...');
  runAutoEscalation();
}, {
  timezone: "Asia/Singapore"
});


// Set up cron job to expire outdated currency rates - runs daily at 12:05 AM Singapore time
cron.schedule('5 0 * * *', () => {
  console.log('Running scheduled job: Expire outdated currency rates');
  runRateExpiryCheck();
}, {
  timezone: 'Asia/Singapore'
});


// In your app.js or a separate jobs/alerts.js file
cron.schedule('0 9 * * *', async () => { // Every day 9am
  await sendLowStockAlerts();
  await sendWarrantyAlerts();
});


cron.schedule('5 0 * * *', () => {
  console.log('Running scheduled job: auto-renewal job');
  renewalJob();
}, {
  timezone: 'Asia/Singapore'
});

const payrollConfigRoutes = require('./routes/payrollConfigRoutes');
const employeeSalaryRoutes = require('./routes/employeeSalaryRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const masterDataRoutes = require('./routes/masterDataRoutes');
const feedbackRoutes = require('./routes/feedbackRoutes');

//app.use('/api/payroll', payrollRoutes);
app.use('/api/payroll-config', payrollConfigRoutes);
app.use('/api/payroll-policy-assignments', require('./routes/payrollPolicyAssignmentRoutes'));
app.use('/api/employee-salaries', employeeSalaryRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/holiday', holidayRoutes);  
app.use('/api/bank-currency', bankCurrencyRoutes);
app.use('/api/master-data', masterDataRoutes);

app.use('/api/payroll-config-allowance', require('./routes/payrollConfigAllowanceRoutes'));
app.use('/api/payroll-config-deduction', require('./routes/payrollConfigDeductionRoutes'));


app.use('/api', require('./routes/employeeStatutoryRoutes'));
app.use('/api', require('./routes/employeeSalaryHistoryRoutes'));
app.use('/api/feedback', feedbackRoutes);
app.use('/api/payroll', require('./routes/payrollCalculation'));
const employeeReliefsRoutes = require('./routes/employeeReliefsRoutes');
app.use('/api/employee-reliefs', employeeReliefsRoutes);

const employeeAllowanceRoutes = require('./routes/employeeAllowanceRoutes');
app.use('/api/employee-allowances', employeeAllowanceRoutes);
app.use('/api/employee-deductions', require('./routes/employeeDeductionRoutes'));

const employeeDependentsRoutes = require('./routes/employeeDependentsRoutes');
app.use('/api/dependents', employeeDependentsRoutes);

//claim
const claimRoutes = require('./routes/claimRoutes');
app.use('/api/claims', claimRoutes);
const benefitTypeRoutes = require('./routes/benefitTypeRoutes');
app.use('/api/benefits', benefitTypeRoutes);
const employeeBenefitRoutes = require('./routes/employeeBenefitRoutes');
app.use('/api/employee-benefits', employeeBenefitRoutes);

app.use('/api/approval', require('./routes/approvalRoutes'));

const approvalConfigRoutes = require('./routes/approvalConfigRoutes');
app.use('/api/approval-config', approvalConfigRoutes);


const disciplinaryTypeRoutes = require('./routes/employeeDisciplinaryTypeRoutes');
app.use('/api/disciplinary-types', disciplinaryTypeRoutes);

const benefitRoutes = require('./routes/benefitRoutes');
app.use('/api', benefitRoutes);


app.use('/api/notifications', require('./routes/notifications'));
require('./jobs/birthdayScheduler'); 
const { runBenefitRenewalJob } = require('./jobs/benefitRenewal');

cron.schedule('0 0 * * *', async () => {
  console.log('Starting scheduled benefit renewal...');
  await runBenefitRenewalJob('system', 'scheduled');
});

app.use('/api/convert', require('./routes/officeConvertRoutes'));

require('./jobs/positionSync');

require('./jobs/salarySync'); // starts the schedule

require('./jobs/payrollJobScheduler'); // start cron jobs automatically

app.post('/benefits-renewal', async (req, res) => {
  const mockUser = { name: req.body.processed_by || 'SystemAdmin' }; // fallback
  await runBenefitRenewalJob(mockUser.name, req.body.job_type || 'manual');
  //await runBenefitRenewalJob(req.user.name, 'manual');
  res.json({ success: true, message: 'Manual renewal job triggered.' });
});

const attendanceIpRoutes = require('./routes/attendanceIp.routes');
app.use('/api/attendance', attendanceIpRoutes);


const schedulesRoutes = require('./routes/schedulesRoutes');
app.use('/api/schedules', schedulesRoutes);

app.get('/health', (req, res) => res.status(200).json({ 
  status: 'UP',
  specsLoaded: specs.length,
  time: new Date().toISOString() 
}));

app.get('/test-expire-rates', async (req, res) => {
  await runRateExpiryCheck();
  res.json({ message: 'Rate expiry check executed' });
});


// app.use((err, req, res, next) => {
//   console.error('Unhandled error:', err);
//   res.status(500).json({ error: 'Internal Server Error' });
// });


app.use(errorHandler);
const PORT = process.env.PORT || 5001; // Render assigns PORT
app.listen(PORT, () => console.log(`Server listening on ${PORT}`));
//app.listen(5001, '0.0.0.0', () => console.log('Server running on port 5001'));
