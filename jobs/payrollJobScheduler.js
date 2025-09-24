// const cron = require('node-cron');
// const { dbPromise } = require('../models/db');
// const moment = require('moment');

// const runPayrollJobs = async (isTest = false) => {
//   const now = moment();
//   const logs = [];

//   try {
//     // Fetch job config
//     const [rows] = await dbPromise.query(`SELECT * FROM payroll_job_config`);
//     const config = Object.fromEntries(rows.map(row => [row.config_key, row.config_value]));

//     const today = now.date();

//     // Auto Generate Draft
//     if (parseInt(config.draft_day) === today) {
//       // Your logic here: e.g. create draft payroll for current month
//       logs.push(`Draft payrolls generated.`);
//     }

//     // Auto Finalize
//     if (parseInt(config.finalize_day) === today) {
//       await dbPromise.query(`
//         UPDATE payroll SET status_code = 'FINAL', updated_at = NOW()
//         WHERE status_code = 'DRAFT'
//       `);
//       logs.push(`Payrolls auto-finalized.`);
//     }

//     // Auto Pay
//     if (parseInt(config.auto_pay_day) === today) {
//       await dbPromise.query(`
//         UPDATE payroll SET status_code = 'PAID', paid_at = NOW(), updated_at = NOW()
//         WHERE status_code = 'FINAL'
//       `);
//       logs.push(`Payrolls marked as paid.`);
//     }

//     // Log the job
//     await dbPromise.query(`
//       INSERT INTO payroll_job_logs (job_type, status, details, executed_at, test_mode)
//       VALUES ('auto-payroll', 'SUCCESS', ?, NOW(), ?)
//     `, [logs.join(' | '), isTest ? 1 : 0]);

//   } catch (err) {
//     console.error('[Payroll Job Cron] Error:', err);
//     await dbPromise.query(`
//       INSERT INTO payroll_job_logs (job_type, status, details, executed_at, test_mode)
//       VALUES ('auto-payroll', 'FAILED', ?, NOW(), ?)
//     `, [err.message, isTest ? 1 : 0]);
//   }
// };

// // 🕐 Schedule to run every day at 2 AM
// cron.schedule('0 2 * * *', () => {
//   runPayrollJobs(false); // false = real mode
// });

// module.exports = { runPayrollJobs };


const cron = require('node-cron');
const { dbPromise } = require('../models/db');
const moment = require('moment');

const runPayrollJobs = async (isTest = false) => {
  const now = moment();
  const startedAt = new Date();
  const logs = [];

  let status = 'SUCCESS';
  let message = 'Job executed successfully';
  let extraInfo = null;

  try {
    // Fetch job config
    const [rows] = await dbPromise.query(`SELECT * FROM payroll_job_config`);
    const config = Object.fromEntries(rows.map(row => [row.config_key, row.config_value]));

    const today = now.date();

    // Auto Generate Draft
    if (parseInt(config.draft_day) === today) {
      // e.g. generateDraftPayroll();
      logs.push(`Draft payrolls generated.`);
    }

    // Auto Finalize
    if (parseInt(config.finalize_day) === today) {
      await dbPromise.query(`
        UPDATE payroll SET status_code = 'FINAL', updated_at = NOW()
        WHERE status_code = 'DRAFT'
      `);
      logs.push(`Payrolls auto-finalized.`);
    }

    // Auto Pay
    if (parseInt(config.auto_pay_day) === today) {
      await dbPromise.query(`
        UPDATE payroll SET status_code = 'PAID', paid_at = NOW(), updated_at = NOW()
        WHERE status_code = 'FINAL'
      `);
      logs.push(`Payrolls marked as paid.`);
    }

    extraInfo = { logs };

  } catch (err) {
    console.error('[Payroll Job Cron] Error:', err);
    status = 'FAILED';
    message = 'Payroll job failed';
    extraInfo = { error: err.message || String(err), stack: err.stack };
  }

  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

  // Write to payroll_job_logs
  try {
    await dbPromise.query(`
      INSERT INTO payroll_job_logs 
        (job_type, trigger_type, status, message, started_at, ended_at, duration_seconds, created_by, extra_info)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      'auto-payroll',
      isTest ? 'test' : 'auto',
      status,
      message,
      startedAt,
      endedAt,
      durationSeconds,
      null, // created_by is null for cron
      JSON.stringify(extraInfo)
    ]);
  } catch (logErr) {
    console.error('Failed to log payroll job execution:', logErr);
  }
};

// 🕐 Schedule to run every day at 2 AM
cron.schedule('0 2 * * *', () => {
  runPayrollJobs(false); // false = real mode
});

module.exports = { runPayrollJobs };
