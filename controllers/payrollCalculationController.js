//controllers\payrollCalculationController.js
const { dbPromise } = require('../models/db');
const payrollCalcService = require('../services/payrollCalculationService');
const multer = require('multer');
const ExcelJS = require('exceljs');
const AWS = require('aws-sdk'); 
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3'); 

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
  signatureVersion: 'v4',
  endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com` // Ensure endpoint is correct for your region
});



// Multer in-memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

// AWS S3 client (v3)
// Create S3 client (v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  // credentials are optional if running on an IAM role (ECS/EC2/Lambda)
  credentials: (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY)
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
      }
    : undefined,
  // If you use a custom S3-compatible endpoint (e.g., MinIO), uncomment:
  // endpoint: process.env.S3_ENDPOINT, // e.g. 'https://s3.ap-southeast-1.amazonaws.com'
  // forcePathStyle: true,
});

const runMulter = (req, res) =>
  new Promise((resolve, reject) => {
    upload.single('excelFile')(req, res, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });

const getPayrollId = async (conn, empId, m, y) => {
  const [rows] = await conn.query(
    `SELECT id FROM payroll WHERE employee_id=? AND period_month=? AND period_year=? LIMIT 1`,
    [empId, m, y]
  );
  return rows.length ? rows[0].id : null;
};


// List payrolls
exports.getPayrollList = async (req, res) => {
  try {
    const {
      employee_id,
      employee_name,
      period_month,
      period_year,
      from_date,
      to_date,
      company_id,
      status,
      page = 1,
      limit = 20
    } = req.query;

    const offset = (page - 1) * limit;
    const params = [];

    let baseQuery = `
      SELECT 
        p.id as payroll_id, 
        p.*, 
        e.name AS employee_name,
        e.email, e.salary, e.currency, e.leave_balance, e.company_id, e.manager_id,
        e.role, e.joined_date, e.resigned_date, e.gender, e.employee_no, e.employment_type,
        e.job_level, e.department, e.position, e.superior, e.office, e.nationality,
        e.visa_expired_date, e.passport_expired_date, e.status AS employee_status,
        e.activation, e.ic_passport, e.confirmation_date, e.marital_status, e.dob,
        e.age, e.mobile_number, e.country_code, e.payment_company, e.pay_interval,
        e.payment_method, e.bank_name, e.bank_currency, e.bank_account_name,
        e.bank_account_no, e.income_tax_no, e.socso_account_no, e.epf_account_no,
        e.company AS employee_company, e.race, e.religion, e.attachment,
        e.address, e.qualification, e.education_level,
        e.emergency_contact_name, e.emergency_contact_relationship, e.emergency_contact_phone,
        e.emergency_contact_email, e.is_superadmin, e.current_position_start_date
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE 1=1
    `;

    if (employee_id) {
      baseQuery += ' AND p.employee_id = ?';
      params.push(employee_id);
    }

    if (employee_name) {
      baseQuery += ' AND e.name LIKE ?';
      params.push(`%${employee_name}%`);
    }

    if (period_month) {
      baseQuery += ' AND p.period_month = ?';
      params.push(period_month);
    }

    if (period_year) {
      baseQuery += ' AND p.period_year = ?';
      params.push(period_year);
    }

    if (from_date && to_date) {
      baseQuery += ' AND p.created_at BETWEEN ? AND ?';
      params.push(from_date, to_date);
    }

    if (company_id) {
      baseQuery += ' AND e.company_id = ?';
      params.push(company_id);
    }

    if (status) {
      baseQuery += ' AND p.status_code = ?';
      params.push(status);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) AS count_alias`;
    const [countRows] = await dbPromise.query(countQuery, params);
    const total = countRows[0].total;

    baseQuery += ` ORDER BY p.row_order ASC LIMIT ? OFFSET ?`;
    params.push(parseInt(limit), parseInt(offset));

    const [payrollRows] = await dbPromise.query(baseQuery, params);

    // Extract employee_ids
    const employeeIds = payrollRows.map(row => row.employee_id);

    // Fetch dependents for these employees
    let dependents = [];
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => '?').join(',');
      const [dependentRows] = await dbPromise.query(
        `SELECT * FROM employee_dependents WHERE employee_id IN (${placeholders})`,
        employeeIds
      );
      dependents = dependentRows;
    }

    res.json({
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      data: payrollRows,
      dependents
    });
  } catch (err) {
    console.error('Failed to fetch payroll list', err);
    res.status(500).json({ error: 'Failed to fetch payroll list' });
  }
};



// GET /api/payroll/adjustments/ - Load payroll data for adjustments page
exports.getPayrollListByMonth = async (req, res) => {
  try {
    const {
      employee_id,
      employee_name,
      period_month,
      period_year,
      company_id,
      status,
      page = 1,
      limit = 20,
      all_data
    } = req.query;

    if (!period_month || !period_year) {
      return res.status(400).json({ error: 'period_month and period_year are required.' });
    }

    const params = [];

    let baseQuery = `
      SELECT
        p.*,
        e.name AS employee_name,
        e.email, e.salary, e.currency, e.leave_balance, e.company_id, e.manager_id,
        e.role, e.joined_date, e.resigned_date, e.gender, e.employee_no, e.employment_type,
        e.job_level, e.department, e.position, e.superior, e.office, e.nationality,
        e.visa_expired_date, e.passport_expired_date, e.status AS employee_status,
        e.activation, e.ic_passport, e.confirmation_date, e.marital_status, e.dob,
        e.age, e.mobile_number, e.country_code, e.payment_company, e.pay_interval,
        e.payment_method, e.bank_name, e.bank_currency, e.bank_account_name,
        e.bank_account_no, e.income_tax_no, e.socso_account_no, e.epf_account_no,
        e.company AS employee_company, e.race, e.religion, e.attachment,
        e.address, e.qualification, e.education_level,
        e.emergency_contact_name, e.emergency_contact_relationship, e.emergency_contact_phone,
        e.emergency_contact_email, e.is_superadmin, e.current_position_start_date,
        c.name AS company_name
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      INNER JOIN companies c ON e.company_id = c.id
      WHERE p.period_month = ? AND p.period_year = ?
    `;

    params.push(period_month, period_year);

    if (employee_id) {
      baseQuery += ' AND p.employee_id = ?';
      params.push(employee_id);
    }

    if (employee_name) {
      baseQuery += ' AND e.name LIKE ?';
      params.push(`%${employee_name}%`);
    }

    if (company_id) {
      baseQuery += ' AND e.company_id = ?';
      params.push(company_id);
    }

    if (status) {
      baseQuery += ' AND p.status_code = ?';
      params.push(status);
    }

    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) AS count_alias`;
    const [countRows] = await dbPromise.query(countQuery, params);
    const total = countRows[0].total;

    if (all_data !== 'true') {
      const offset = (parseInt(page) - 1) * parseInt(limit);
      baseQuery += ` ORDER BY p.row_order ASC LIMIT ? OFFSET ?`;
      params.push(parseInt(limit), parseInt(offset));
    } else {
      baseQuery += ` ORDER BY p.row_order ASC`;
    }

    const [payrollRows] = await dbPromise.query(baseQuery, params);

    const payrollIds = payrollRows.map(row => row.id);
    const employeeIds = payrollRows.map(row => row.employee_id);

    // ✅ Fetch dependents
    let dependents = [];
    if (employeeIds.length) {
      const placeholders = employeeIds.map(() => '?').join(',');
      const [dependentRows] = await dbPromise.query(
        `SELECT * FROM employee_dependents WHERE employee_id IN (${placeholders})`,
        employeeIds
      );
      dependents = dependentRows;
    }

    // ✅ Fetch payslip_items
    let payslipMap = {};
    if (payrollIds.length) {
      const placeholders = payrollIds.map(() => '?').join(',');
      const [payslipItems] = await dbPromise.query(
        `SELECT * FROM payslip_items WHERE payroll_id IN (${placeholders})`,
        payrollIds
      );
      for (const item of payslipItems) {
        if (!payslipMap[item.payroll_id]) payslipMap[item.payroll_id] = [];
        payslipMap[item.payroll_id].push(item);
      }
    }

    // ✅ Fetch employer_contributions
    let employerMap = {};
    if (payrollIds.length) {
      const placeholders = payrollIds.map(() => '?').join(',');
      const [employerItems] = await dbPromise.query(
        `SELECT * FROM employer_contributions WHERE payroll_id IN (${placeholders})`,
        payrollIds
      );
      for (const item of employerItems) {
        if (!employerMap[item.payroll_id]) employerMap[item.payroll_id] = [];
        employerMap[item.payroll_id].push(item);
      }
    }

    // ✅ Attach to each payroll row
    for (const row of payrollRows) {
      row.payslip_items = payslipMap[row.id] || [];
      row.employer_contributions = employerMap[row.id] || [];
    }

    res.json({
      total,
      page: all_data === 'true' ? 1 : parseInt(page),
      limit: all_data === 'true' ? total : parseInt(limit),
      data: payrollRows,
      dependents
    });
  } catch (err) {
    console.error('Failed to fetch payroll list for specific month', err);
    res.status(500).json({ error: 'Failed to fetch payroll list' });
  }
};


// Get detail for one payroll run (with items and employer contributions)
exports.getPayrollDetail = async (req, res) => {
  try {
    const payroll_id = req.params.id;
    const [[payroll]] = await dbPromise.query(
      `SELECT p.*, e.name AS employee_name FROM payroll p 
       LEFT JOIN employees e ON p.employee_id = e.id 
       WHERE p.id = ?`, [payroll_id]
    );
    if (!payroll) return res.status(404).json({ error: 'Not found' });

    // Payslip items
    const [payslip_items] = await dbPromise.query(
      `SELECT * FROM payslip_items WHERE payroll_id = ? ORDER BY id`, [payroll_id]
    );
    // Employer contributions
    const [employer_contributions] = await dbPromise.query(
      `SELECT * FROM employer_contributions WHERE payroll_id = ? ORDER BY id`, [payroll_id]
    );

    res.json({ ...payroll, payslip_items, employer_contributions });
  } catch (err) {
    res.status(500).json({ error: 'Fetch failed' });
  }
};

exports.getPayrollsByEmployee = async (req, res) => {
  const { employee_id } = req.params;

  // Validate employee_id
  if (!employee_id || isNaN(employee_id)) {
    return res.status(400).json({ error: 'Invalid employee ID' });
  }

  try {
    // Fetch all payrolls for the given employee
    const [payrolls] = await dbPromise.query(
      `SELECT p.*, e.name AS employee_name 
       FROM payroll p 
       LEFT JOIN employees e ON p.employee_id = e.id 
       WHERE p.employee_id = ?`,
      [employee_id]
    );

    if (!payrolls.length) {
      return res.status(404).json({ error: 'No payrolls found for this employee' });
    }

    // Prepare an array to hold detailed payroll info
    const detailedPayrolls = [];

    for (const payroll of payrolls) {
      const payroll_id = payroll.id;

      // Fetch payslip items for this payroll
      const [payslip_items] = await dbPromise.query(
        `SELECT * FROM payslip_items WHERE payroll_id = ? ORDER BY id`,
        [payroll_id]
      );

      // Fetch employer contributions for this payroll
      const [employer_contributions] = await dbPromise.query(
        `SELECT * FROM employer_contributions WHERE payroll_id = ? ORDER BY id`,
        [payroll_id]
      );

      // Combine all data into a single object
      detailedPayrolls.push({
        ...payroll,
        payslip_items,
        employer_contributions,
      });
    }

    res.json(detailedPayrolls);
  } catch (err) {
    console.error('Error fetching payrolls:', err);
    res.status(500).json({ error: 'An error occurred while fetching payroll data' });
  }
};

// 'DRAFT', 'ADJUST', 'FINAL', 'PAID', 'HOLD', 'VOID') — not just 'FINAL'.
// General status update for payroll
exports.updatePayrollStatus = async (req, res) => {
  try {
    const { payroll_ids, status_code } = req.body;

    if (!Array.isArray(payroll_ids) || payroll_ids.length === 0) {
      return res.status(400).json({ error: 'No payroll_ids provided' });
    }

    if (!status_code) {
      return res.status(400).json({ error: 'No status_code provided' });
    }

    // ✅ Step 1: Validate status code exists in master table
    const [statusCheck] = await dbPromise.query(
      `SELECT COUNT(*) AS count FROM payroll_status_master WHERE code = ?`,
      [status_code]
    );
    if (statusCheck[0].count === 0) {
      return res.status(400).json({ error: `Invalid status_code: ${status_code}` });
    }

    // ✅ Step 2: Check end_date from payroll_policy_assignment
    const [assignments] = await dbPromise.query(`
      SELECT DISTINCT p.policy_assignment_id, pa.end_date 
      FROM payroll p 
      JOIN payroll_policy_assignment pa ON p.policy_assignment_id = pa.id 
      WHERE p.id IN (?)
    `, [payroll_ids]);

    for (const row of assignments) {
      if (row.end_date && new Date() > new Date(row.end_date)) {
        return res.status(400).json({
          error: `Payroll period has ended for policy_assignment_id ${row.policy_assignment_id}. Cannot modify.`
        });
      }
    }

    // ✅ Step 3: Fetch current statuses for audit logging
    const [existingStatuses] = await dbPromise.query(
      `SELECT id, status_code FROM payroll WHERE id IN (?)`, [payroll_ids]
    );

    // ✅ Step 4: Update and log each payroll
    for (const { id, status_code: oldStatus } of existingStatuses) {
      await dbPromise.query(
        `UPDATE payroll SET status_code = ?, updated_at = NOW() WHERE id = ?`,
        [status_code, id]
      );

      await dbPromise.query(`
        INSERT INTO payroll_audit_log 
        (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
        VALUES (?, 'status_update', ?, ?, ?, ?, NOW())
      `, [
        id,
        oldStatus,
        status_code,
        `Changed status from ${oldStatus} to ${status_code}`,
        req.user?.id || 0
      ]);
    }

    res.json({ success: true, updated_ids: payroll_ids, status_code });
  } catch (err) {
    console.error('Payroll status update error:', err);
    res.status(500).json({ error: 'Failed to update payroll status' });
  }
};


// controllers/payrollController.js
exports.getPayrollVersions = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT version_no, snapshot_json, rollback_reason 
      FROM payroll_versions 
      WHERE payroll_id = ?
      ORDER BY version_no DESC
    `, [req.params.id]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching payroll versions:', err);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
};



exports.rollbackPayroll = async (req, res) => {
  const payrollId = req.params.id;
  const version = req.params.version;
  const userId = req.body.user_id || 0;
  const reason = req.body.reason || 'No reason provided';

  try {


      // 1. Check current payroll status
      const [payrollRows] = await dbPromise.query(
        `SELECT status_code FROM payroll WHERE id = ?`,
        [payrollId]
      );

      if (!payrollRows.length) {
        return res.status(404).json({ error: 'Payroll not found' });
      }

      const currentStatus = payrollRows[0].status_code;
      if (['FINAL', 'PAID'].includes(currentStatus)) {
        return res.status(400).json({
          error: `Cannot rollback payroll with status '${currentStatus}'. Only Draft, Adjust, or Hold allowed.`
        });
      }


    const [rows] = await dbPromise.query(
      `SELECT snapshot_json FROM payroll_versions 
       WHERE payroll_id = ? AND version = ?`,
      [payrollId, version]
    );

    if (!rows.length) return res.status(404).json({ error: 'Version not found' });

    const snapshot = JSON.parse(rows[0].snapshot_json);

    // 1. Update payroll
    await dbPromise.query(`UPDATE payroll SET 
      employee_id = ?, period_year = ?, period_month = ?,
      basic_salary = ?, total_allowance = ?, gross_salary = ?,
      total_deduction = ?, net_salary = ?, epf_employee = ?, epf_employer = ?,
      socso_employee = ?, socso_employer = ?, eis_employee = ?, eis_employer = ?,
      pcb = ?, status_code = ?, updated_at = NOW()
      WHERE id = ?`, [
      snapshot.employee_id, snapshot.period_year, snapshot.period_month,
      snapshot.basic_salary, snapshot.total_allowance, snapshot.gross_salary,
      snapshot.total_deduction, snapshot.net_salary,
      snapshot.epf_employee, snapshot.epf_employer,
      snapshot.socso_employee, snapshot.socso_employer,
      snapshot.eis_employee, snapshot.eis_employer,
      snapshot.pcb, snapshot.status, payrollId
    ]);

    // 2. Delete old
    await dbPromise.query(`DELETE FROM payslip_items WHERE payroll_id = ?`, [payrollId]);
    await dbPromise.query(`DELETE FROM employer_contributions WHERE payroll_id = ?`, [payrollId]);

    // 3. Insert payslip + employer contributions
    for (const item of snapshot.payslip_items) {
      await dbPromise.query(`
        INSERT INTO payslip_items (payroll_id, label, amount, type, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [payrollId, item.label, item.amount, item.type]);
    }

    for (const item of snapshot.employer_contributions) {
      await dbPromise.query(`
        INSERT INTO employer_contributions (payroll_id, label, amount, type, created_at)
        VALUES (?, ?, ?, ?, NOW())
      `, [payrollId, item.label, item.amount, item.type]);
    }

    // 4. Audit log (including reason)
    await dbPromise.query(`
      INSERT INTO payroll_audit_log 
      (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
      VALUES (?, 'rollback', ?, ?, ?, ?, NOW())
    `, [
      payrollId,
      `to version ${version}`,
      `version=${version}`,
      reason,
      userId
    ]);

    res.json({ success: true, message: 'Payroll rollback successful' });
  } catch (err) {
    console.error('Rollback error:', err);
    res.status(500).json({ error: 'Failed to rollback payroll' });
  }
};


// GET /api/payroll/:id/audit-log
exports.getAuditLog = async (req, res) => {
  try {
    const [logs] = await dbPromise.query(`
      SELECT al.*, u.name AS user_name
      FROM payroll_audit_log al
      LEFT JOIN users u ON al.updated_by = u.id
      WHERE al.payroll_id = ?
      ORDER BY al.updated_at DESC
    `, [req.params.id]);

    res.json(logs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
};



// POST /api/payroll/job/test
exports.runPayrollJobTest = async (req, res) => {
  const startedAt = new Date();
  let status = 'SUCCESS';
  let message = 'Test job run completed';
  let errorMessage = null;

  try {
    const { runPayrollJobs } = require('../jobs/payrollJobScheduler');
    await runPayrollJobs(true); // test mode
  } catch (err) {
    console.error('Test job error:', err);
    status = 'FAILED';
    message = 'Test job run failed';
    errorMessage = err.message || String(err);
  }

  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

  try {
    await dbPromise.query(
      `INSERT INTO payroll_job_logs 
      (job_type, trigger_type, status, message, started_at, ended_at, duration_seconds, created_by, extra_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    'auto-payroll',                  // job_type
    'auto',                          // trigger_type
    'SUCCESS',                       // status
    'Auto payroll job completed',   // message
    startedAt,
    endedAt,
    durationSeconds,
    null,                            // created_by (null for cron jobs)
    JSON.stringify({ note: 'Executed by cron at ' + new Date().toISOString() }) // extra_info
  ]);

    //   INSERT INTO payroll_job_logs 
    //     (trigger_type, status, message, started_at, ended_at, duration_seconds, created_by, extra_info)
    //    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    //   [
    //     'test', 
    //     status, 
    //     message, 
    //     startedAt, 
    //     endedAt, 
    //     durationSeconds,
    //     req.user?.id || null,  // if using auth
    //     errorMessage ? JSON.stringify({ error: errorMessage }) : null
    //   ]
    // );
    
  } catch (logErr) {
    console.error('Failed to log job execution:', logErr);
  }

  if (status === 'FAILED') {
    return res.status(500).json({ success: false, error: message });
  }

  res.json({ success: true, message });
};


// payrollController.js
exports.getPayrollJobLogs = async (req, res) => {
  const { status, trigger_type, from, to, page = 1, limit = 50 } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push(`status = ?`);
    params.push(status);
  }

  if (trigger_type) {
    conditions.push(`trigger_type = ?`);
    params.push(trigger_type);
  }

  if (from) {
    conditions.push(`started_at >= ?`);
    params.push(from);
  }

  if (to) {
    conditions.push(`started_at <= ?`);
    params.push(to);
  }

  let whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const sql = `
    SELECT * FROM payroll_job_logs
    ${whereClause}
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(*) as total FROM payroll_job_logs
    ${whereClause}
  `;

  try {
    const [countResult] = await dbPromise.query(countSql, params);
    const total = countResult[0]?.total || 0;

    const [rows] = await dbPromise.query(sql, [...params, parseInt(limit), offset]);

    res.json({
      data: rows,
      total,
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Error fetching job logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};


exports.getJobConfig = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT config_key, config_value FROM payroll_job_config
    `);

    const config = {};

    for (const row of rows) {
      let { config_key, config_value } = row;

      // Type conversion
      if (config_value === 'true') config_value = true;
      else if (config_value === 'false') config_value = false;
      else if (!isNaN(config_value)) config_value = Number(config_value);

      config[config_key] = config_value;
    }

    res.json(config);
  } catch (err) {
    console.error("Error fetching job config", err);
    res.status(500).json({ error: "Failed to fetch job config" });
  }
};



exports.updateJobConfig = async (req, res) => {
  try {
    const config = req.body;
    const updates = [];
    const params = [];

    for (const [key, value] of Object.entries(config)) {
      // Convert boolean values to string for SQL storage
      const sqlValue = typeof value === 'boolean' ? value.toString() : value;
      updates.push(`${key} = ?`);
      params.push(sqlValue);
    }

    // Update all config values in a single transaction
    await dbPromise.query(`
      UPDATE payroll_job_config
      SET config_value = CASE config_key
        ${updates.map(update => `WHEN '${update.split(' = ')[0]}' THEN ?`).join('\n')}
        ELSE config_value
      END
      WHERE config_key IN (${updates.map(update => `'${update.split(' = ')[0]}'`).join(',')})
    `, params);

    res.json({ success: true });
  } catch (err) {
    console.error("Error updating job config", err);
    res.status(500).json({ error: "Failed to update job config" });
  }
};



exports.reorderPayroll = async (req, res) => {
  const orderList = req.body.order; // Expected: [{ id: 1, row_order: 1 }, ...]

  if (!Array.isArray(orderList)) {
    return res.status(400).json({ error: 'Invalid payload format' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of orderList) {
      if (typeof item.id !== 'number' || typeof item.row_order !== 'number') continue;
      await conn.query(
        `UPDATE payroll SET row_order = ? WHERE id = ?`,
        [item.row_order, item.id]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Payroll order updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Error updating row order:', err);
    res.status(500).json({ error: 'Failed to update row order' });
  } finally {
    conn.release();
  }
};

//Cmments

// POST /api/payroll/comments
exports.addPayslipComment = async (req, res) => {
  const { payroll_id, payslip_item_id, column_name, comment } = req.body;
  const created_by = req.user?.id || 0;

  if (!payroll_id || !payslip_item_id || !column_name || !comment) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  await dbPromise.query(`
    INSERT INTO payslip_item_comments 
    (payroll_id, payslip_item_id, column_name, comment, created_by)
    VALUES (?, ?, ?, ?, ?)`,
    [payroll_id, payslip_item_id, column_name, comment, created_by]);

  res.json({ success: true });
};

// GET /api/payroll/:payroll_id/comments
exports.getPayslipComments = async (req, res) => {
  const { payroll_id } = req.params;
  const [rows] = await dbPromise.query(`
    SELECT * FROM payslip_item_comments WHERE payroll_id = ?
  `, [payroll_id]);

  res.json(rows);
};

// PUT /api/payroll/comments/:id
exports.updatePayslipComment = async (req, res) => {
  const { id } = req.params; // Get the comment ID from URL parameters
  const { comment, column_name, payslip_item_id, payroll_id } = req.body; // Get fields to update from request body
  const updated_by = req.user?.id || 0; // Assuming you have user ID from authentication

  // Validate that the comment ID is provided
  if (!id) {
    return res.status(400).json({ error: 'Comment ID is required for update.' });
  }

  // Validate that at least one field to update is provided
  if (!comment && !column_name && !payslip_item_id && !payroll_id) {
    return res.status(400).json({ error: 'No fields provided for update.' });
  }

  try {
    let updateQuery = 'UPDATE payslip_item_comments SET ';
    const updateParams = [];
    const fieldsToUpdate = [];

    // Conditionally add fields to update
    if (comment !== undefined) { // Check for undefined to allow empty string updates
      fieldsToUpdate.push('comment = ?');
      updateParams.push(comment);
    }
    if (column_name !== undefined) {
      fieldsToUpdate.push('column_name = ?');
      updateParams.push(column_name);
    }
    if (payslip_item_id !== undefined) {
      fieldsToUpdate.push('payslip_item_id = ?');
      updateParams.push(payslip_item_id);
    }
    if (payroll_id !== undefined) {
      fieldsToUpdate.push('payroll_id = ?');
      updateParams.push(payroll_id);
    }

    // Add updated_at and updated_by to the update fields
    fieldsToUpdate.push('updated_at = CURRENT_TIMESTAMP');
    // If you want to track who updated it, ensure updated_by is added to the table
    // fieldsToUpdate.push('updated_by = ?');
    // updateParams.push(updated_by);

    updateQuery += fieldsToUpdate.join(', ') + ' WHERE id = ?';
    updateParams.push(id);

    const [result] = await dbPromise.query(updateQuery, updateParams);

    // Check if any row was affected to determine if the comment was found and updated
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found or no changes made.' });
    }

    res.json({ success: true, message: 'Comment updated successfully.' });
  } catch (err) {
    console.error('Failed to update payslip comment:', err);
    res.status(500).json({ error: 'Failed to update payslip comment.' });
  }
};

// DELETE /api/payroll/comments/:id
exports.deletePayslipComment = async (req, res) => {
  const { id } = req.params; // Get the comment ID from URL parameters

  // Validate that the comment ID is provided
  if (!id) {
    return res.status(400).json({ error: 'Comment ID is required for deletion.' });
  }

  try {
    const [result] = await dbPromise.query(
      `DELETE FROM payslip_item_comments WHERE id = ?`,
      [id]
    );

    // Check if any row was affected to determine if the comment was found and deleted
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    res.json({ success: true, message: 'Comment deleted successfully.' });
  } catch (err) {
    console.error('Failed to delete payslip comment:', err);
    res.status(500).json({ error: 'Failed to delete payslip comment.' });
  }
};

//export

// GET /api/payroll/:id/export
exports.exportPayrollWithComments = async (req, res) => {
  const { id: payroll_id } = req.params;

  if (!payroll_id) {
    return res.status(400).json({ error: 'Payroll ID is required for export.' });
  }

  try {
    // Fetch the main payroll record
    const [[payrollRecord]] = await dbPromise.query(
      `SELECT
         p.*,
         e.name AS employee_name,
         e.employee_no,
         e.company_id,
         e.department,
         e.position
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.id = ?`,
      [payroll_id]
    );

    if (!payrollRecord) {
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    // Fetch all payslip items associated with this payroll
    const [payslipItems] = await dbPromise.query(
      `SELECT * FROM payslip_items WHERE payroll_id = ?`,
      [payroll_id]
    );

    // Fetch all comments associated with this payroll
    const [comments] = await dbPromise.query(
      `SELECT
         p.payslip_item_id,
         p.column_name,
         p.comment,
         p.created_at,
         u.name AS created_by_name -- Assuming you have a users table to join for names
       FROM payslip_item_comments p
       LEFT JOIN employees u ON p.created_by = u.id -- Join with users table to get created_by name
       WHERE p.payroll_id = ?`,
      [payroll_id]
    );

    // Organize comments by payslip_item_id and column_name for easier consumption by frontend
    const organizedComments = {};
    comments.forEach(comment => {
      if (!organizedComments[comment.payslip_item_id]) {
        organizedComments[comment.payslip_item_id] = {};
      }
      // Store comment details, potentially including who made it and when
      organizedComments[comment.payslip_item_id][comment.column_name] = {
        comment: comment.comment,
        created_by_name: comment.created_by_name,
        created_at: comment.created_at
      };
    });

    // Combine payslip items with their respective comments
    const payslipItemsWithComments = payslipItems.map(item => ({
      ...item,
      comments: organizedComments[item.id] || {} // Attach comments to the specific payslip item
    }));

    // Prepare the data structure for frontend export
    const exportData = {
      payroll: payrollRecord,
      payslip_items: payslipItemsWithComments,
      // You might also want to include general payroll comments if you have them
      // general_comments: await getPayrollComments(payroll_id) // Example if you have general payroll comments
    };

    res.json(exportData);

  } catch (err) {
    console.error('Failed to prepare payroll data for export:', err);
    res.status(500).json({ error: 'Failed to prepare payroll data for export.' });
  }
};

exports.exportPayrollByMonthWithComments = async (req, res) => {
  const { period_month, period_year } = req.query;

  if (!period_month || !period_year) {
    return res.status(400).json({ error: 'period_month and period_year are required for monthly export.' });
  }

  try {
    // Fetch all payroll records for the specified month and year
    const [payrollRecords] = await dbPromise.query(
      `SELECT
         p.*,
         e.name AS employee_name,
         e.employee_no,
         e.company_id,
         e.department,
         e.position
       FROM payroll p
       JOIN employees e ON p.employee_id = e.id
       WHERE p.period_month = ? AND p.period_year = ?
       ORDER BY e.employee_no, p.id`, // Order for consistent export
      [period_month, period_year]
    );

    if (payrollRecords.length === 0) {
      return res.status(404).json({ message: 'No payroll records found for the specified month and year.' });
    }

    const allPayrollIds = payrollRecords.map(p => p.id);

    // Fetch all payslip items for all relevant payrolls in one go
    const [allPayslipItems] = await dbPromise.query(
      `SELECT * FROM payslip_items WHERE payroll_id IN (?) ORDER BY payroll_id, id`,
      [allPayrollIds]
    );

    // Fetch all comments for all relevant payrolls in one go
    const [allComments] = await dbPromise.query(
      `SELECT
         p.payroll_id,
         p.payslip_item_id,
         p.column_name,
         p.comment,
         p.created_at,
         u.name AS created_by_name
       FROM payslip_item_comments p
       LEFT JOIN users u ON p.created_by = u.id
       WHERE p.payroll_id IN (?)`,
      [allPayrollIds]
    );

    // Organize payslip items and comments for efficient lookup
    const payslipItemsMap = new Map();
    allPayslipItems.forEach(item => {
      if (!payslipItemsMap.has(item.payroll_id)) {
        payslipItemsMap.set(item.payroll_id, []);
      }
      payslipItemsMap.get(item.payroll_id).push(item);
    });

    const commentsMap = new Map();
    allComments.forEach(comment => {
      if (!commentsMap.has(comment.payslip_item_id)) {
        commentsMap.set(comment.payslip_item_id, {});
      }
      commentsMap.get(comment.payslip_item_id)[comment.column_name] = {
        comment: comment.comment,
        created_by_name: comment.created_by_name,
        created_at: comment.created_at
      };
    });

    // Combine all data into the final export structure
    const exportData = payrollRecords.map(payroll => {
      const payslipItemsForPayroll = payslipItemsMap.get(payroll.id) || [];
      const payslipItemsWithComments = payslipItemsForPayroll.map(item => ({
        ...item,
        comments: commentsMap.get(item.id) || {}
      }));

      return {
        payroll: payroll,
        payslip_items: payslipItemsWithComments
      };
    });

    res.json(exportData);

  } catch (err) {
    console.error('Failed to prepare monthly payroll data for export:', err);
    res.status(500).json({ error: 'Failed to prepare monthly payroll data for export.' });
  }
};


// PATCH /api/payroll/:id - Updated with version saving and recalculation
exports.updatePayrollField = async (req, res) => {
  const payrollId = req.params.id;
  const updates = req.body;
  const updated_by = req.user?.id || null;

  const allowedFields = [
    'total_allowance', 'gross_salary', 'total_deduction', 'net_salary',
    'epf_employee', 'epf_employer', 'socso_employee', 'socso_employer',
    'eis_employee', 'eis_employer', 'pcb', 'remarks'
  ];

  const setClause = [];
  const values = [];

  for (const key in updates) {
    if (allowedFields.includes(key)) {
      setClause.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }

  if (setClause.length === 0) {
    return res.status(400).json({ error: "No valid fields to update" });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // 1. Fetch current payroll for version logging
    const [[payrollBeforeUpdate]] = await conn.query(`
      SELECT * FROM payroll WHERE id = ?
    `, [payrollId]);
    
    if (!payrollBeforeUpdate) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll record not found.' });
    }

    // Check status - only allow updates for DRAFT and ADJUST
    if (!['DRAFT', 'ADJUST'].includes(payrollBeforeUpdate.status_code)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot modify finalized payroll.' });
    }

    // 2. Save version before making changes
    const [payslipItems] = await conn.query(`
      SELECT * FROM payslip_items WHERE payroll_id = ?
    `, [payrollId]);
    
    const [employerContribs] = await conn.query(`
      SELECT * FROM employer_contributions WHERE payroll_id = ?
    `, [payrollId]);

    const snapshot = {
      ...payrollBeforeUpdate,
      payslip_items: payslipItems,
      employer_contributions: employerContribs
    };

    const [[{ max_ver }]] = await conn.query(`
      SELECT COALESCE(MAX(version_no), 0) + 1 AS max_ver
      FROM payroll_versions WHERE payroll_id = ?
    `, [payrollId]);

    await conn.query(`
      INSERT INTO payroll_versions (
        payroll_id, version_no, snapshot_json, updated_by, created_at
      )
      VALUES (?, ?, ?, ?, NOW())
    `, [payrollId, max_ver, JSON.stringify(snapshot), updated_by]);

    // 3. Update payroll fields
    values.push(payrollId);
    const updateQuery = `UPDATE payroll SET ${setClause.join(', ')}, updated_at = NOW() WHERE id = ?`;
    const [result] = await conn.query(updateQuery, values);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll record not found or no changes made.' });
    }

    // 4. Log the update in audit trail
    await conn.query(`
      INSERT INTO payroll_audit_log 
      (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
      VALUES (?, 'field_update', ?, ?, ?, ?, NOW())
    `, [
      payrollId,
      'Manual field update',
      JSON.stringify(updates),
      `Updated fields: ${Object.keys(updates).join(', ')}`,
      updated_by
    ]);

    await conn.commit();

    // 5. Recalculate payroll to ensure consistency
    try {
      await payrollCalcService.recalculatePayrollAfterAdjustment(payrollId, updated_by);
      res.json({ 
        success: true, 
        updated: updates, 
        version_no: max_ver,
        message: 'Payroll updated and recalculated successfully'
      });
    } catch (recalcErr) {
      console.error('Recalculation error:', recalcErr);
      res.json({ 
        success: true, 
        updated: updates, 
        version_no: max_ver,
        warning: 'Payroll updated but recalculation failed: ' + recalcErr.message
      });
    }

  } catch (err) {
    await conn.rollback();
    console.error("Payroll update error:", err);
    res.status(500).json({ error: "Failed to update payroll" });
  } finally {
    conn.release();
  }
};



function toManualType(t) {
  const v = String(t || '').trim().toLowerCase();

  if (v === 'earning') return 'Earning';
  if (v === 'deduction') return 'Deduction';
  if (v === 'statutory') return 'Statutory';
  if (v === 'employer contribution') return 'Employer Contribution';
  if (v === 'adjustment') return 'Adjustment';

  throw new Error(`Invalid type: ${t}`);
}


exports.adjustPayslipItem = async (req, res) => {
  const { payroll_id, label, amount, type, operation = 'add' } = req.body;
  const updated_by = req.user?.id || null;

  if (!payroll_id || !label || amount == null || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // 1) Validate and lock payroll row
    const [[payroll]] = await conn.query(
      `SELECT * FROM payroll WHERE id = ? FOR UPDATE`,
      [payroll_id]
    );
    if (!payroll) {
      await conn.rollback();
      return res.status(404).json({ error: 'Payroll not found' });
    }
    if (!['DRAFT', 'ADJUST'].includes(payroll.status_code)) {
      await conn.rollback();
      return res.status(400).json({ error: 'Cannot modify finalized payroll' });
    }

    // 2) Save version before making changes
    const [payslipItems] = await conn.query(
      `SELECT * FROM payslip_items WHERE payroll_id = ?`,
      [payroll_id]
    );
    const [employerContribs] = await conn.query(
      `SELECT * FROM employer_contributions WHERE payroll_id = ?`,
      [payroll_id]
    );

    const snapshot = {
      ...payroll,
      payslip_items: payslipItems,
      employer_contributions: employerContribs
    };

    const [[{ max_ver }]] = await conn.query(
      `SELECT COALESCE(MAX(version_no), 0) + 1 AS max_ver
       FROM payroll_versions WHERE payroll_id = ?`,
      [payroll_id]
    );

    await conn.query(
      `INSERT INTO payroll_versions
         (payroll_id, version_no, snapshot_json, updated_by, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [payroll_id, max_ver, JSON.stringify(snapshot), updated_by]
    );

    // 3) Manualize type and lock existing item row (if any)
    const manualType = toManualType(type);

    const [[existingItem]] = await conn.query(
      `SELECT * FROM payslip_items
       WHERE payroll_id = ? AND label = ?
       LIMIT 1 FOR UPDATE`,
      [payroll_id, label]
    );

    let oldValue = existingItem ? { ...existingItem } : null;
    let newValue = null;

    // 4) Apply the adjustment
    if (operation === 'delete') {
      if (existingItem) {
        await conn.query(
          `DELETE FROM payslip_items WHERE id = ?`,
          [existingItem.id]
        );
      }
      newValue = null;
    } else if (operation === 'update') {
      if (existingItem) {
        await conn.query(
          `UPDATE payslip_items
             SET amount = ?,
                 type = ?,
                 origin = 'Manual',
                 manual_by = ?,
                 manual_at = NOW(),
                 updated_at = NOW(),
                 updated_by = ?
           WHERE id = ?`,
          [amount, manualType, updated_by, updated_by, existingItem.id]
        );
        const [[after]] = await conn.query(
          `SELECT * FROM payslip_items WHERE id = ?`,
          [existingItem.id]
        );
        newValue = after || null;
      } else {
        const [ins] = await conn.query(
          `INSERT INTO payslip_items
             (payroll_id, label, amount, type, origin, manual_by, manual_at, created_at, created_by)
           VALUES (?, ?, ?, ?, 'Manual', ?, NOW(), NOW(), ?)`,
          [payroll_id, label, amount, manualType, updated_by, updated_by]
        );
        const [[after]] = await conn.query(
          `SELECT * FROM payslip_items WHERE id = ?`,
          [ins.insertId]
        );
        newValue = after || null;
      }
    } else {
      // default: add
      const [ins] = await conn.query(
        `INSERT INTO payslip_items
           (payroll_id, label, amount, type, origin, manual_by, manual_at, created_at, created_by)
         VALUES (?, ?, ?, ?, 'Manual', ?, NOW(), NOW(), ?)`,
        [payroll_id, label, amount, manualType, updated_by, updated_by]
      );
      const [[after]] = await conn.query(
        `SELECT * FROM payslip_items WHERE id = ?`,
        [ins.insertId]
      );
      newValue = after || null;
    }

    // 5) Audit log (old/new snapshots)
    await conn.query(
      `INSERT INTO payroll_audit_log
         (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
       VALUES (?, 'payslip_adjustment', ?, ?, ?, ?, NOW())`,
      [
        payroll_id,
        JSON.stringify(oldValue),
        JSON.stringify(newValue),
        `${operation} ${label} as ${manualType} (origin=Manual)`,
        updated_by
      ]
    );

    // 6) Recalculate using the SAME connection/transaction
    const result = await payrollCalcService.recalculatePayrollAfterAdjustment(
      payroll_id, updated_by, conn
    );

    await conn.commit();

    res.json({
      success: true,
      payroll: result.payroll,
      payslip_items: result.payslip_items,
      employer_contributions: result.employer_contributions,
      message: `Payslip item ${operation}d (${manualType}, origin=Manual) and payroll recalculated successfully`
    });

  } catch (err) {
    await conn.rollback();
    console.error('Adjust payslip error:', err);
    res.status(500).json({ error: 'Failed to adjust payslip item' });
  } finally {
    conn.release();
  }
};


async function getPayrollAdjustments(payrollId, conn) {
  const round2 = (n) => Math.round((+n + Number.EPSILON) * 100) / 100;

  let locked = false;
  try {
    // 0) Advisory lock (5s timeout - shorter since this is read-only)
    const [[{ got_lock }]] = await conn.query(
      `SELECT GET_LOCK(CONCAT('payroll_read_', ?), 5) AS got_lock`,
      [payrollId]
    );
    if (!got_lock) throw new Error('Unable to acquire payroll advisory lock');
    locked = true;

    // 1) Get payroll with employee and company info - UPDATED COLUMN NAME
    const [[payroll]] = await conn.query(`
      SELECT 
    p.id AS payroll_id,
    p.period_year,
    p.period_month,
    p.employee_id,
    p.basic_salary,
    p.total_allowance,
    p.gross_salary,
    p.total_deduction,
    p.net_salary,
    p.epf_employee,
    p.epf_employer,
    p.socso_employee,
    p.socso_employer,
    p.eis_employee,
    p.eis_employer,
    p.pcb,
    p.status_code,
    p.generated_by,
    p.generated_at,
    p.paid_at,
    p.created_at,
    p.updated_at,
    p.remarks,
    p.row_order,
    p.policy_assignment_id,
    e.id AS employee_id,
    e.name AS employee_name,
    e.employee_no,
    e.department AS department_name,
    e.position,
    e.company_id,
    e.ic_passport AS ic_passport_no,
    e.joined_date,
    e.confirmation_date,
    e.resigned_date,
    e.nationality,
    e.income_tax_no AS tax_no,
    e.marital_status,
    e.bank_name,
    b.bank_code,
    e.bank_account_no,
    e.bank_account_name,
    c.name AS company_name,
    e.currency
FROM payroll p
JOIN employees e ON p.employee_id = e.id
JOIN companies c ON e.company_id = c.id
LEFT JOIN banks b ON e.bank_name = b.bank_name
WHERE p.id = ?
    `, [payrollId]);

    if (!payroll) throw new Error('Payroll not found');

    // 2) Get payslip items (read-only, no lock needed)
    const [payslipItems] = await conn.query(`
      SELECT * FROM payslip_items
      WHERE payroll_id = ?
      ORDER BY 
        CASE 
          WHEN type = 'Earning' THEN 1
          WHEN type = 'Deduction' THEN 2
          WHEN type = 'Statutory' THEN 3
          WHEN type LIKE 'Manual%' THEN 4
          ELSE 5
        END,
        label
    `, [payrollId]);

    // 3) Get employer contributions
    const [employerContributions] = await conn.query(`
      SELECT * FROM employer_contributions
      WHERE payroll_id = ?
      ORDER BY label
    `, [payrollId]);

    // 4) Get version history
    const [versions] = await conn.query(`
      SELECT 
        version_no,
        created_at,
        updated_by,
        (SELECT name FROM employees WHERE id = updated_by) AS updated_by_name
      FROM payroll_versions
      WHERE payroll_id = ?
      ORDER BY version_no DESC
      LIMIT 5
    `, [payrollId]);

    // 5) Get audit log
    const [auditLog] = await conn.query(`
      SELECT 
        id,
        action,
        remarks,
        updated_at,
        updated_by,
        (SELECT name FROM employees WHERE id = updated_by) AS updated_by_name
      FROM payroll_audit_log
      WHERE payroll_id = ?
      ORDER BY updated_at DESC
      LIMIT 20
    `, [payrollId]);

    // 6) Format amounts consistently with recalculate function
    const formatAmounts = (obj) => {
      if (!obj) return obj;
      return Object.fromEntries(
        Object.entries(obj).map(([key, value]) => {
          if (typeof value === 'number' && (key.toLowerCase().includes('amount') || 
              key.toLowerCase().includes('salary') || 
              key === 'amount')) {
            return [key, round2(value)];
          }
          return [key, value];
        })
      );
    };

    return {
      payroll: formatAmounts(payroll),
      payslip_items: payslipItems.map(formatAmounts),
      employer_contributions: employerContributions.map(formatAmounts),
      versions,
      audit_log: auditLog,
      success: true
    };
  } finally {
    if (locked) {
      await conn.query(`SELECT RELEASE_LOCK(CONCAT('payroll_read_', ?))`, [payrollId]);
    }
  }
}


// Updated controller function
exports.getPayrollAdjustments = async (req, res) => {
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // --- normalize/coerce incoming params ---
    const employee_id   = req.query.employee_id ? Number(req.query.employee_id) : undefined;
    const employee_name = req.query.employee_name ? String(req.query.employee_name).trim() : undefined;
    const period_month  = req.query.period_month ? Number(req.query.period_month) : undefined;
    const period_year   = req.query.period_year ? Number(req.query.period_year) : undefined;
    const company_id    = req.query.company_id ? Number(req.query.company_id) : undefined;

    const rawStatus     = req.query.status ? String(req.query.status) : ''; // may be empty/undefined
    const statuses      = rawStatus
      .split(',')
      .map(s => s.trim())
      .filter(Boolean); // remove blanks

    const page          = req.query.page ? Number(req.query.page) : 1;
    const limit         = req.query.limit ? Number(req.query.limit) : 20;
    const all_data      = String(req.query.all_data).toLowerCase() === 'true';

    const offset = (page - 1) * limit;

    const params = [];
    let baseQuery = `
      SELECT 
        p.id AS payroll_id
      FROM payroll p
      JOIN employees e ON p.employee_id = e.id
      WHERE 1=1
    `;

    // ---- filters ----
    if (employee_id) {
      baseQuery += ' AND p.employee_id = ?';
      params.push(employee_id);
    }

    if (employee_name) {
      baseQuery += ' AND e.name LIKE ?';
      params.push(`%${employee_name}%`);
    }

    if (Number.isInteger(period_month)) {
      baseQuery += ' AND p.period_month = ?';
      params.push(period_month);
    }

    if (Number.isInteger(period_year)) {
      baseQuery += ' AND p.period_year = ?';
      params.push(period_year);
    }

    if (company_id) {
      baseQuery += ' AND e.company_id = ?';
      params.push(company_id);
    }

    // Status behavior:
    // - If statuses provided -> filter by those exactly
    // - If NOT provided -> DO NOT filter (return all statuses)
    if (statuses.length) {
      baseQuery += ` AND p.status_code IN (${statuses.map(() => '?').join(',')})`;
      params.push(...statuses);
    }

    // ---- count before pagination ----
    const countQuery = `SELECT COUNT(*) AS total FROM (${baseQuery}) t`;
    const [[countRow]] = await conn.query(countQuery, params);
    const total = Number(countRow.total) || 0;

    // ---- page query ----
    let pageQuery = `${baseQuery} ORDER BY p.updated_at DESC, p.id DESC`;
    const pageParams = [...params];

    if (!all_data) {
      pageQuery += ' LIMIT ? OFFSET ?';
      pageParams.push(limit, offset);
    }

    const [payrollRows] = await conn.query(pageQuery, pageParams);

    // ---- hydrate each payroll id ----
    const data = [];
    for (const row of payrollRows) {
      const full = await getPayrollAdjustments(row.payroll_id, conn);
      if (full) data.push(full);
    }

    await conn.commit();

    res.json({
      total,
      page,
      limit,
      data // no extra slice; SQL already handled it
    });
  } catch (err) {
    await conn.rollback();
    console.error('Failed to fetch payroll adjustments', err);
    res.status(500).json({
      error: 'Failed to fetch payroll adjustments',
      details: err.message
    });
  } finally {
    conn.release();
  }
};


exports.uploadPayrollExcel = async (req, res) => {
  // 1) Handle upload
  try {
    await runMulter(req, res);
  } catch (err) {
    const code = err?.name === 'MulterError' ? 400 : 500;
    return res.status(code).json({ error: err?.message || 'Upload failed' });
  }
  if (!req.file) {
    return res.status(400).json({ error: 'No Excel file uploaded.' });
  }

  const updated_by = (req.user && req.user.id) ? req.user.id : null;

  // 2) S3 upload
  const bucket = process.env.AWS_BUCKET_NAME;
  if (!bucket || !process.env.AWS_REGION) {
    return res.status(500).json({ error: 'S3 is not configured (bucket/region missing).' });
  }
  const timestamp = Date.now();
  const originalFileName = req.file.originalname || 'import.xlsx';
  const s3Key = `payroll-imports/${timestamp}_${originalFileName}`;
  let s3Location = null;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    }));
    s3Location = `s3://${bucket}/${s3Key}`;
    console.log(`[payroll-import] Uploaded to ${s3Location}`);
  } catch (e) {
    console.error('[payroll-import] S3 upload failed:', e);
    return res.status(500).json({ error: 'Failed to upload to S3', details: e.message });
  }

  // 3) Parse Excel
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(req.file.buffer);
  } catch (e) {
    console.error('[payroll-import] Excel parse failed:', e);
    return res.status(400).json({
      error: 'Invalid or corrupted .xlsx file',
      details: e.message,
      s3_key: s3Key
    });
  }

  const worksheet = workbook.getWorksheet(1);
  if (!worksheet) {
    return res.status(400).json({ error: 'No worksheet found in the Excel file.', s3_key: s3Key });
  }

  // 4) Read headers
  const headers = [];
  (worksheet.getRow(1) || { eachCell: () => {} }).eachCell((cell, colNum) => {
    headers[colNum - 1] = String((cell && cell.value) ?? '').trim();
  });

  const required = ['employee_id', 'period_month', 'period_year', 'label', 'amount', 'type'];
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length) {
    return res.status(400).json({
      error: `Missing required headers: ${missing.join(', ')}`,
      got: headers,
      s3_key: s3Key
    });
  }

  const idxOf = (name) => headers.indexOf(name);
  const importData = [];
  const errors = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const cells = row.values; // 1-based array
    const cellVal = (name) => {
      const i = idxOf(name);
      const v = i >= 0 ? cells[i + 1] : undefined;
      return (v && v.text !== undefined) ? v.text : v; // text for rich cells
    };

    const employee_id = cellVal('employee_id');
    const period_month = cellVal('period_month');
    const period_year = cellVal('period_year');
    const label = cellVal('label');
    const amountRaw = cellVal('amount');
    const type = String(cellVal('type') || '').trim();

    if (!(employee_id && period_month && period_year && label && amountRaw !== undefined && type)) {
      errors.push(`Row ${rowNumber}: missing core data`);
      return;
    }
    const amount = Number(amountRaw);
    if (Number.isNaN(amount)) {
      errors.push(`Row ${rowNumber}: amount is not a number`);
      return;
    }

    importData.push({
      employee_id: String(employee_id).trim(),
      period_month: Number(period_month),
      period_year: Number(period_year),
      label: String(label).trim(),
      amount,
      type // use as-is (no normalization)
    });
  });

  if (errors.length) {
    return res.status(400).json({
      error: 'Excel file contains validation errors.',
      details: errors,
      s3_key: s3Key
    });
  }

  // 5) DB transaction: upsert + audit + import log (+ optional recalculation)
  const conn = await dbPromise.getConnection();
  const inserted = [];
  const updated = [];
  const touchedPayrollIds = new Set();

  try {
    await conn.beginTransaction();

    for (const item of importData) {
      const payrollId = await getPayrollId(conn, item.employee_id, item.period_month, item.period_year);
      if (!payrollId) {
        throw new Error(`No payroll found for employee_id=${item.employee_id}, ${item.period_month}/${item.period_year}`);
      }
      touchedPayrollIds.add(payrollId);

      const typeFromExcel = String(item.type || '').trim();

      // check existing (same payroll_id + label + type)
      const [existing] = await conn.query(
        `SELECT id, payroll_id, label, amount, type
         FROM payslip_items
         WHERE payroll_id=? AND label=? AND type=?
         LIMIT 1`,
        [payrollId, item.label, typeFromExcel]
      );

      if (existing.length > 0) {
        const oldItem = existing[0];
        const oldAmount = Number(oldItem.amount);
        const newAmount = Number(item.amount);

        if (oldAmount !== newAmount) {
          // update
          await conn.query(
            `UPDATE payslip_items
             SET amount=?, origin='Manual', manual_by=?, manual_at=NOW(), updated_at=NOW()
             WHERE id=?`,
            [newAmount, updated_by, oldItem.id]
          );

          // audit (update)
          await conn.query(
            `INSERT INTO payroll_audit_log
             (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
             VALUES (?, 'payslip_adjustment', ?, ?, ?, ?, NOW())`,
            [
              payrollId,
              JSON.stringify({
                id: oldItem.id,
                label: oldItem.label,
                type: oldItem.type,
                amount: oldAmount
              }),
              JSON.stringify({
                id: oldItem.id,
                label: oldItem.label,
                type: typeFromExcel,
                amount: newAmount
              }),
              `Updated payslip item via import: ${oldItem.label}`,
              updated_by
            ]
          );

          updated.push({
            payroll_id: payrollId,
            payslip_item_id: oldItem.id,
            label: oldItem.label,
            type: typeFromExcel,
            old_amount: oldAmount,
            new_amount: newAmount
          });
        }
        // if unchanged: no write
      } else {
        // insert
        const [ins] = await conn.query(
          `INSERT INTO payslip_items
           (payroll_id, label, amount, type, origin, manual_by, manual_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'Manual', ?, NOW(), NOW(), NOW())`,
          [payrollId, item.label, item.amount, typeFromExcel, updated_by]
        );
        const newId = ins.insertId;

        // audit (insert)
        await conn.query(
          `INSERT INTO payroll_audit_log
           (payroll_id, action, old_value, new_value, remarks, updated_by, updated_at)
           VALUES (?, 'payslip_adjustment', ?, ?, ?, ?, NOW())`,
          [
            payrollId,
            JSON.stringify(null),
            JSON.stringify({
              id: newId,
              label: item.label,
              type: typeFromExcel,
              amount: Number(item.amount)
            }),
            `Inserted payslip item via import: ${item.label}`,
            updated_by
          ]
        );

        inserted.push({
          payroll_id: payrollId,
          payslip_item_id: newId,
          label: item.label,
          type: typeFromExcel,
          amount: Number(item.amount)
        });
      }
    }

    // Optional: recalc once per affected payroll (if you have this function and want immediate totals update)
    // for (const pid of touchedPayrollIds) {
    //   await recalculatePayrollAfterAdjustment(pid, updated_by, conn);
    // }

    // import log
    await conn.query(
      `INSERT INTO import_logs (file_name, s3_key, uploaded_by, status, imported_rows, created_at)
       VALUES (?, ?, ?, 'SUCCESS', ?, NOW())`,
      [originalFileName, s3Key, updated_by, importData.length]
    );

    await conn.commit();

    return res.json({
      success: true,
      message: 'Excel uploaded and processed.',
      s3_key: s3Key,
      s3_location: s3Location,
      insertedCount: inserted.length,
      updatedCount: updated.length,
      inserted,
      updated
    });
  } catch (e) {
    await conn.rollback();
    console.error('[payroll-import] DB transaction failed:', e);

    // Best-effort failed log
    try {
      await conn.query(
        `INSERT INTO import_logs (file_name, s3_key, uploaded_by, status, imported_rows, created_at)
         VALUES (?, ?, ?, 'FAILED', ?, NOW())`,
        [originalFileName, s3Key, updated_by, importData.length]
      );
    } catch (_) {}

    return res.status(500).json({
      error: 'Failed to import data to database.',
      details: e.message,
      s3_key: s3Key
    });
  } finally {
    conn.release();
  }
};


exports.previewPayroll = async (req, res) => {
  try {
    const { policy_assignment_id, period_from, period_to, include_claims = true, claims_mode } = req.body;

    if (!policy_assignment_id || !period_from || !period_to) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const preview = await payrollCalcService.calculateAndSavePayroll({
      payroll_policy_assignment_id: policy_assignment_id,
      period_from,
      period_to,
      generated_by: req.user ? req.user.id : null,
      commit: false,
      include_claims,   // back-compat
      claims_mode       // new tri-state control
    });

    res.json({ preview, success: true });
  } catch (err) {
    console.error('Preview Payroll Error:', err);
    res.status(500).json({ error: err.message || 'Payroll preview failed.' });
  }
};


exports.generatePayroll = async (req, res) => {
  try {
    const { policy_assignment_id, period_from, period_to, include_claims = true, claims_mode } = req.body;
    
    if (!policy_assignment_id || !period_from || !period_to) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const [[assignment]] = await dbPromise.query(`
      SELECT end_date FROM payroll_policy_assignment WHERE id = ?
    `, [policy_assignment_id]);

    if (assignment?.end_date && new Date() > new Date(assignment.end_date)) {
      return res.status(400).json({ error: 'Payroll period has ended. Cannot modify.' });
    }

    // Preview first (no commit)
    const preview = await payrollCalcService.calculateAndSavePayroll({
      payroll_policy_assignment_id: policy_assignment_id,
      period_from,
      period_to,
      generated_by: req.user ? req.user.id : null,
      commit: false,
      include_claims,  // back-compat
      claims_mode      // new tri-state control
    });

    // Commit
    const result = await payrollCalcService.calculateAndSavePayroll({
      payroll_policy_assignment_id: policy_assignment_id,
      period_from,
      period_to,
      generated_by: req.user ? req.user.id : null,
      commit: true,
      include_claims,
      claims_mode
    });

    // Stats based on preview
    const detailList = Array.isArray(preview) ? preview : (result?.data || []);
    const total_processed = detailList.length;
    const total_skipped = detailList.filter(p => p.error).length;
    const total_generated = total_processed - total_skipped;

    res.json({
      success: true,
      total_processed,
      total_generated,
      total_skipped,
      details: detailList
    });
  } catch (err) {
    console.error('Generate Payroll Error:', err);
    res.status(500).json({ error: err.message || 'Payroll generation failed.' });
  }
};

// controller
exports.getEmployeePayslips1 = async (req, res) => {
  const { employeeId } = req.params;
  const { status, year, month } = req.query;

  try {
    const filters = ['p.employee_id = ?'];
    const params = [employeeId];

    if (status) {
      // allow CSV: status=PAID,FINAL
      const list = String(status).split(',').map(s => s.trim().toUpperCase());
      filters.push(`p.status_code IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (year) {
      filters.push('p.period_year = ?');
      params.push(Number(year));
    }
    if (month) {
      filters.push('p.period_month = ?');
      params.push(Number(month));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    // Base rows
    const [rows] = await dbPromise.query(`
      SELECT p.*,
             e.name AS employee_name
      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      ${where}
      ORDER BY p.period_year DESC, p.period_month DESC, p.id DESC
    `, params);

    // Load items for each payroll_id
    const ids = rows.map(r => r.id);
    let itemsByPayroll = new Map();
    let contribByPayroll = new Map();

    if (ids.length) {
      const [items] = await dbPromise.query(`
        SELECT id, payroll_id, label, amount, type, origin, item_order, created_at, updated_at
        FROM payslip_items
        WHERE payroll_id IN (?)
        ORDER BY COALESCE(item_order, id)
      `, [ids]);

      const [contrib] = await dbPromise.query(`
        SELECT id, payroll_id, label, amount, type, created_at
        FROM employer_contributions
        WHERE payroll_id IN (?)
        ORDER BY id
      `, [ids]);

      itemsByPayroll = items.reduce((m, it) => {
        const arr = m.get(it.payroll_id) || [];
        arr.push(it);
        m.set(it.payroll_id, arr);
        return m;
      }, new Map());

      contribByPayroll = contrib.reduce((m, it) => {
        const arr = m.get(it.payroll_id) || [];
        arr.push(it);
        m.set(it.payroll_id, arr);
        return m;
      }, new Map());
    }

    const result = rows.map(r => ({
      ...r,
      payslip_items: itemsByPayroll.get(r.id) || [],
      employer_contributions: contribByPayroll.get(r.id) || [],
    }));

    res.json(result);
  } catch (err) {
    console.error('getEmployeePayslips error', err);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
};

// controller
exports.getEmployeePayslips = async (req, res) => {
  const { employeeId } = req.params;
  const { status, year, month } = req.query;

  try {
    const filters = ['p.employee_id = ?'];
    const params = [employeeId];

    if (status) {
      const list = String(status).split(',').map(s => s.trim().toUpperCase());
      filters.push(`p.status_code IN (${list.map(() => '?').join(',')})`);
      params.push(...list);
    }
    if (year) {
      filters.push('p.period_year = ?');
      params.push(Number(year));
    }
    if (month) {
      filters.push('p.period_month = ?');
      params.push(Number(month));
    }

    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

    // --- Base rows, now with employee & company details selected ---
    const [rows] = await dbPromise.query(`
      SELECT
        p.*,
        e.name                         AS employee_name,
        e.employee_no                  AS emp_employee_no,
        e.ic_passport                  AS emp_ic_passport,
        e.department                   AS emp_department,
        e.position                     AS emp_position,
        e.currency                     AS emp_currency,
        e.bank_name                    AS emp_bank_name,
        e.bank_account_no              AS emp_bank_account_no,
        e.epf_account_no               AS emp_epf_account_no,
        e.socso_account_no             AS emp_socso_account_no,
        e.income_tax_no                AS emp_income_tax_no,
        e.attachment                   AS emp_photo_attachment,   -- optional photo/attachment field

        c.id                           AS company_id,
        c.name                         AS company_name,
        c.address                      AS company_address,
        c.registration_number          AS company_reg_no,
        c.epf_account_no               AS company_epf_no,
        c.socso_account_no             AS company_socso_no,
        c.income_tax_no                AS company_tax_no

      FROM payroll p
      JOIN employees e ON e.id = p.employee_id
      LEFT JOIN companies c ON c.id = e.company_id
      ${where}
      ORDER BY p.period_year DESC, p.period_month DESC, p.id DESC
    `, params);

    // Load items for each payroll_id
    const ids = rows.map(r => r.id);
    let itemsByPayroll = new Map();
    let contribByPayroll = new Map();

    if (ids.length) {
      const [items] = await dbPromise.query(`
        SELECT id, payroll_id, label, amount, type, origin, item_order, created_at, updated_at
        FROM payslip_items
        WHERE payroll_id IN (?)
        ORDER BY COALESCE(item_order, id)
      `, [ids]);

      const [contrib] = await dbPromise.query(`
        SELECT id, payroll_id, label, amount, type, created_at
        FROM employer_contributions
        WHERE payroll_id IN (?)
        ORDER BY id
      `, [ids]);

      itemsByPayroll = items.reduce((m, it) => {
        const arr = m.get(it.payroll_id) || [];
        arr.push(it);
        m.set(it.payroll_id, arr);
        return m;
      }, new Map());

      contribByPayroll = contrib.reduce((m, it) => {
        const arr = m.get(it.payroll_id) || [];
        arr.push(it);
        m.set(it.payroll_id, arr);
        return m;
      }, new Map());
    }

    const monthName = (m) =>
      ['', 'January','February','March','April','May','June','July','August','September','October','November','December'][m] || String(m);

    const result = rows.map(r => {
      // If you store a full URL in `attachment`, use it directly; otherwise map to your public uploads path.
      const photoUrl = r.emp_photo_attachment
        ? (/^https?:\/\//i.test(r.emp_photo_attachment)
            ? r.emp_photo_attachment
            : `${process.env.PUBLIC_UPLOAD_BASE_URL || ''}/${r.emp_photo_attachment}`)
        : null;

      return {
        // keep original fields as-is:
        ...r,

        // new, structured blocks for your payslip header:
        company: {
          id: r.company_id,
          name: r.company_name || null,
          address: r.company_address || null,
          registration_no: r.company_reg_no || null,
          epf_no: r.company_epf_no || null,
          socso_no: r.company_socso_no || null,
          tax_no: r.company_tax_no || null,
        },
        employee_profile: {
          id: r.employee_id,
          name: r.employee_name,
          employee_no: r.emp_employee_no || null,
          ic_passport: r.emp_ic_passport || null,
          department: r.emp_department || null,
          position: r.emp_position || null,
          currency: r.emp_currency || null,
          photo_url: photoUrl,
        },
        bank_statutory: {
          bank_name: r.emp_bank_name || null,
          account_no: r.emp_bank_account_no || null,
          epf_no: r.emp_epf_account_no || null,
          socso_no: r.emp_socso_account_no || null,
          tax_ref_no: r.emp_income_tax_no || null,
          payroll_period_label: `${monthName(r.period_month)} ${r.period_year}`,
        },

        payslip_items: itemsByPayroll.get(r.id) || [],
        employer_contributions: contribByPayroll.get(r.id) || [],
      };
    });

    res.json(result);
  } catch (err) {
    console.error('getEmployeePayslips error', err);
    res.status(500).json({ error: 'Failed to fetch payslips' });
  }
};


// {
//   "policy_assignment_id": 7,
//   "period_from": "2025-08-01",
//   "period_to": "2025-08-31",
//   "claims_mode": "claims_only"
// }
