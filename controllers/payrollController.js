const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');
const payrollUtils = require('../utils/payrollUtils');

// Process payroll for all employees
exports.processPayroll = async (req, res) => {
  try {
    const { month } = req.body;
    
    // Start transaction
    await dbPromise.query('START TRANSACTION');
    
    try {
      // Get all active employees
      const [employees] = await dbPromise.query(`
        SELECT id FROM employees WHERE status = 'Active'
      `);
      
      // Process each employee
      for (const employee of employees) {
        await processEmployeePayroll(employee.id, month);
      }
      
      await dbPromise.query('COMMIT');
      res.json({ success: true, message: `Payroll processed for ${employees.length} employees` });
    } catch (err) {
      await dbPromise.query('ROLLBACK');
      throw err;
    }
  } catch (err) {
    console.error('Error processing payroll:', err);
    res.status(500).json({ error: 'Failed to process payroll' });
  }
};

exports.processPayroll1 = async (req, res) => {
  try {
    // Step 1: Get all active employees with salaries configured
    const [employees] = await db.query(`
      SELECT DISTINCT es.employee_id
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      WHERE e.status = 'Active'
    `);

    const payrollResults = [];

    for (const emp of employees) {
      const employeeId = emp.employee_id;

      // Step 2: Calculate salary
      const gross = await payrollUtils.calculateGrossSalary(employeeId);
      const net = await payrollUtils.calculateNetSalary(employeeId);
      const deductions = await payrollUtils.getStatutoryDeductions(employeeId);

      // Step 3: Optional - Save or build payslip item
      payrollResults.push({
        employeeId,
        grossSalary: gross,
        netSalary: net,
        deductions,
        processedAt: new Date()
      });

      // You could optionally INSERT INTO payslip_items table here
    }

    return res.status(200).json({
      success: true,
      totalProcessed: payrollResults.length,
      data: payrollResults
    });

  } catch (error) {
    console.error('Payroll Processing Error:', error);
    res.status(500).json({ success: false, message: 'Payroll processing failed' });
  }
};

async function processEmployeePayroll(employeeId, month) {
  // Get employee salary
  const [salaryRows] = await dbPromise.query(`
    SELECT * FROM employee_salary 
    WHERE employee_id = ?
    ORDER BY effective_date DESC LIMIT 1
  `, [employeeId]);
  
  if (salaryRows.length === 0) {
    throw new Error(`No salary found for employee ${employeeId}`);
  }
  
  const salary = salaryRows[0];
  
  // Calculate allowances
  const [allowances] = await dbPromise.query(`
    SELECT SUM(amount) as total FROM employee_allowances
    WHERE employee_id = ? AND is_recurring = 1
    AND (end_date IS NULL OR end_date >= CURDATE())
  `, [employeeId]);
  
  // Calculate deductions
  const [deductions] = await dbPromise.query(`
    SELECT SUM(amount) as total FROM employee_deductions
    WHERE employee_id = ? AND is_recurring = 1
    AND (end_date IS NULL OR end_date >= CURDATE())
  `, [employeeId]);
  
  // Calculate overtime
  const [overtime] = await dbPromise.query(`
    SELECT SUM(hours * 
      CASE rate_type 
        WHEN '1.5x' THEN 1.5 
        WHEN '2.0x' THEN 2.0 
        WHEN '3.0x' THEN 3.0 
        ELSE 1.0 
      END * (salary.basic_salary / 160)) as total
    FROM employee_overtimes ot
    JOIN employee_salary salary ON ot.employee_id = salary.employee_id
    WHERE ot.employee_id = ? AND ot.approved = 1
    AND DATE_FORMAT(ot.date, '%Y-%m') = ?
    AND salary.effective_date = (
      SELECT MAX(effective_date) FROM employee_salary 
      WHERE employee_id = ? AND effective_date <= LAST_DAY(?)
    )
  `, [employeeId, month, employeeId, month]);
  
  // Calculate gross and net salary
  const basicSalary = parseFloat(salary.basic_salary);
  const totalAllowances = allowances[0].total || 0;
  const totalDeductions = deductions[0].total || 0;
  const overtimePay = overtime[0].total || 0;
  
  const grossSalary = basicSalary + totalAllowances + overtimePay;
  const netSalary = grossSalary - totalDeductions;
  
  // Insert payroll record
  await dbPromise.query(`
    INSERT INTO payrolls (
      employee_id, month, basic_salary, gross_salary, 
      total_allowances, total_deductions, net_salary, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Completed')
  `, [
    employeeId, month, basicSalary, grossSalary,
    totalAllowances, totalDeductions, netSalary
  ]);
  
  const [payroll] = await dbPromise.query(`
    SELECT LAST_INSERT_ID() as id
  `);
  
  const payrollId = payroll[0].id;
  
  // Add payslip items
  await addPayslipItems(payrollId, employeeId, basicSalary, totalAllowances, totalDeductions);
}

async function addPayslipItems(payrollId, employeeId, basicSalary, totalAllowances, totalDeductions) {
  // Add basic salary
  await dbPromise.query(`
    INSERT INTO payslip_items (payroll_id, label, amount, type, item_order)
    VALUES (?, 'Basic Salary', ?, 'Earning', 1)
  `, [payrollId, basicSalary]);
  
  // Add allowances
  const [allowances] = await dbPromise.query(`
    SELECT am.name, ea.amount 
    FROM employee_allowances ea
    JOIN allowance_master am ON ea.allowance_id = am.id
    WHERE ea.employee_id = ? AND ea.is_recurring = 1
    AND (ea.end_date IS NULL OR ea.end_date >= CURDATE())
  `, [employeeId]);
  
  let order = 2;
  for (const allowance of allowances) {
    await dbPromise.query(`
      INSERT INTO payslip_items (payroll_id, label, amount, type, item_order)
      VALUES (?, ?, ?, 'Earning', ?)
    `, [payrollId, allowance.name, allowance.amount, order++]);
  }
  
  // Add deductions
  const [deductions] = await dbPromise.query(`
    SELECT dm.name, ed.amount 
    FROM employee_deductions ed
    JOIN deduction_master dm ON ed.deduction_id = dm.id
    WHERE ed.employee_id = ? AND ed.is_recurring = 1
    AND (ed.end_date IS NULL OR ed.end_date >= CURDATE())
  `, [employeeId]);
  
  for (const deduction of deductions) {
    await dbPromise.query(`
      INSERT INTO payslip_items (payroll_id, label, amount, type, item_order)
      VALUES (?, ?, ?, 'Deduction', ?)
    `, [payrollId, deduction.name, deduction.amount, order++]);
  }
  
  // Add statutory contributions (simplified)
  const epfEmployee = basicSalary * 0.11;
  const epfEmployer = basicSalary * 0.13;
  
  await dbPromise.query(`
    INSERT INTO payslip_items (payroll_id, label, amount, type, item_order)
    VALUES (?, 'EPF Employee', ?, 'Statutory', ?)
  `, [payrollId, epfEmployee, order++]);
  
  await dbPromise.query(`
    INSERT INTO payslip_employer_contributions (payroll_id, type, amount)
    VALUES (?, 'EPF', ?)
  `, [payrollId, epfEmployer]);
}

// Get payroll status for a specific month/year
exports.getPayrollStatus = async (req, res) => {
  try {
    const { month, year } = req.params;
    const period = `${year}-${month.padStart(2, '0')}`;

    const [rows] = await dbPromise.query(`
      SELECT status, locked_by, locked_at 
      FROM payroll_periods 
      WHERE period = ?
    `, [period]);

    const status = rows.length > 0 ? rows[0].status : 'unprocessed';
    const lockedBy = rows.length > 0 ? rows[0].locked_by : null;
    const lockedAt = rows.length > 0 ? rows[0].locked_at : null;

    res.json({
      period,
      status,
      lockedBy,
      lockedAt
    });
  } catch (err) {
    console.error('Error checking payroll status:', err);
    res.status(500).json({ error: 'Failed to check payroll status' });
  }
};

// Lock payroll for processing
exports.lockPayroll = async (req, res) => {
  try {
    const { period } = req.body;
    const userId = req.user?.id || 1; // fallback to ID 1 if undefined

    await dbPromise.query(`
      INSERT INTO payroll_periods (period, status, locked_by, locked_at)
      VALUES (?, 'locked', ?, NOW())
      ON DUPLICATE KEY UPDATE 
        status = 'locked', 
        locked_by = ?, 
        locked_at = NOW()
    `, [period, userId, userId]);

    res.json({ success: true, message: `Payroll for ${period} locked successfully` });
  } catch (err) {
    console.error('Error locking payroll:', err);
    res.status(500).json({ error: 'Failed to lock payroll' });
  }
};

// Unlock payroll (admin only)
exports.unlockPayroll = async (req, res) => {
  try {
    const { period } = req.body;

    const userId = req.user ? req.user.id : 1; // fallback to admin/system ID

    await dbPromise.query(`
      UPDATE payroll_periods 
      SET status = 'unlocked', 
          unlocked_by = ?, 
          unlocked_at = NOW()
      WHERE period = ?
    `, [userId, period]);

    res.json({ success: true, message: `Payroll for ${period} unlocked successfully` });
  } catch (err) {
    console.error('Error unlocking payroll:', err);
    res.status(500).json({ error: 'Failed to unlock payroll' });
  }
};
