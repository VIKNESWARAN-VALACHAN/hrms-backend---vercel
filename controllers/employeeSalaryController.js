const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// Get all employee salaries
exports.getAllSalaries = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT es.*, e.name as employee_name, e.employee_no 
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      ORDER BY es.effective_date DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employee salaries:', err);
    res.status(500).json({ error: 'Failed to fetch employee salaries' });
  }
};

// Get single salary record
exports.getSalary = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT es.*, e.name as employee_name, e.employee_no 
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      WHERE es.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Salary record not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching salary record:', err);
    res.status(500).json({ error: 'Failed to fetch salary record' });
  }
};

// Get salary history for an employee
exports.getSalaryHistory = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT es.*, e.name as employee_name, e.employee_no 
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      WHERE es.employee_id = ?
      ORDER BY es.effective_date DESC
    `, [req.params.employeeId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching salary history:', err);
    res.status(500).json({ error: 'Failed to fetch salary history' });
  }
};

// Get salary by employee
exports.getSalariesByEmployee = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT es.*, e.name as employee_name, e.employee_no 
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      WHERE es.employee_id = ?
      ORDER BY es.effective_date DESC
    `, [req.params.employeeId]);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employee salaries:', err);
    res.status(500).json({ error: 'Failed to fetch employee salaries' });
  }
};

// Create new employee salary
exports.createSalary = async (req, res) => {
  try {
    const { employee_id, basic_salary, effective_date, bank_name, account_number } = req.body;
    
    const sql = `INSERT INTO employee_salary (
      employee_id, basic_salary, effective_date, bank_name, account_number
    ) VALUES (?, ?, ?, ?, ?)`;
    
    const [result] = await dbPromise.query(sql, [
      employee_id, basic_salary, effective_date, bank_name, account_number
    ]);
    
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating employee salary:', err);
    res.status(500).json({ error: 'Failed to create employee salary' });
  }
};

// Update employee salary
exports.updateSalary = async (req, res) => {
  try {
    const { basic_salary, effective_date, bank_name, account_number } = req.body;
    
    const sql = `UPDATE employee_salary SET 
      basic_salary = ?, effective_date = ?, bank_name = ?, account_number = ?
      WHERE id = ?`;
    
    await dbPromise.query(sql, [
      basic_salary, effective_date, bank_name, account_number, req.params.id
    ]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating employee salary:', err);
    res.status(500).json({ error: 'Failed to update employee salary' });
  }
};

// Delete employee salary
exports.deleteSalary = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM employee_salary WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting employee salary:', err);
    res.status(500).json({ error: 'Failed to delete employee salary' });
  }
};

// Export salaries to Excel
exports.exportSalaries = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT e.employee_no, e.name, es.basic_salary, es.effective_date, 
             es.bank_name, es.account_number
      FROM employee_salary es
      JOIN employees e ON es.employee_id = e.id
      ORDER BY es.effective_date DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Employee Salaries');

    sheet.columns = [
      { header: 'Employee No', key: 'employee_no' },
      { header: 'Name', key: 'name' },
      { header: 'Basic Salary', key: 'basic_salary' },
      { header: 'Effective Date', key: 'effective_date' },
      { header: 'Bank Name', key: 'bank_name' },
      { header: 'Account Number', key: 'account_number' }
    ];

    sheet.addRows(rows);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=employee_salaries.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting employee salaries:', err);
    res.status(500).json({ error: 'Failed to export employee salaries' });
  }
};



/**
 * Helper: check if a given date lies in any finalized payroll period for the employee.
 * Adapt the query to your schema (period start/end + status)
 */
async function isDateInFinalizedPayrollPeriod(conn, employeeId, effectiveDate) {
  const [rows] = await conn.query(
    `
    SELECT 1
    FROM payroll
    WHERE employee_id = ?
      AND status_code IN ('FINAL', 'PAID')
      AND period_year = YEAR(?)
      AND period_month = MONTH(?)
    LIMIT 1
    `,
    [employeeId, effectiveDate, effectiveDate]
  );
  return rows.length > 0;
}


/**
 * Helper: find previous_salary "as of effective_date"
 * - Prefer the latest increment with effective_date <= given date
 * - If none, fallback to employee's current salary (or 0 if null)
 */
async function getPreviousSalaryAsOf(conn, employeeId, effectiveDate) {
  const [incRows] = await conn.query(
    `
    SELECT new_salary
    FROM employee_salary_increments
    WHERE employee_id = ?
      AND effective_date <= ?
    ORDER BY effective_date DESC, id DESC
    LIMIT 1
    `,
    [employeeId, effectiveDate]
  );

  if (incRows.length > 0) {
    return incRows[0].new_salary;
  }

  const [empRows] = await conn.query(
    `SELECT COALESCE(salary, 0) AS salary FROM employees WHERE id = ?`,
    [employeeId]
  );
  if (empRows.length === 0) throw new Error('Employee not found');
  return empRows[0].salary ?? 0;
}

/**
 * POST /api/employees/:employeeId/increments
 * Body: { effective_date: 'YYYY-MM-DD', type: 'PERCENT'|'FIXED', value: number, reason: string, created_by: number }
 */
exports.createIncrement = async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const { effective_date, type, value, reason, created_by } = req.body;

  if (!employeeId || !effective_date || !type || value === undefined || !reason) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['PERCENT', 'FIXED'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // Lock employee row and validate existence
    const [empRows] = await conn.query(
      `SELECT id, joined_date FROM employees WHERE id = ? FOR UPDATE`,
      [employeeId]
    );
    if (empRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }
    const joinedDate = empRows[0].joined_date;

    // Not before joined_date
    if (joinedDate && new Date(effective_date) < new Date(joinedDate)) {
      await conn.rollback();
      return res.status(400).json({ error: 'effective_date cannot be before joined_date' });
    }

    // Get DB "today" to avoid app/DB timezone drift
    const [nowRow] = await conn.query(`SELECT CURDATE() AS today`);
    const today = nowRow[0].today; // 'YYYY-MM-DD'
    const isFuture = new Date(effective_date) > new Date(today);

    // OPTION A: allow only ONE pending (future-dated) increment per employee
    if (isFuture) {
      const [pending] = await conn.query(
        `
        SELECT 1
        FROM employee_salary_increments
        WHERE employee_id = ?
          AND effective_date > CURDATE()
        LIMIT 1
        `,
        [employeeId]
      );
      if (pending.length > 0) {
        await conn.rollback();
        return res.status(409).json({
          error: 'A pending increment already exists. Wait until it takes effect or delete it first.'
        });
      }
    }

    // Unique effective_date per employee
    const [dupe] = await conn.query(
      `SELECT 1 FROM employee_salary_increments WHERE employee_id = ? AND effective_date = ? LIMIT 1`,
      [employeeId, effective_date]
    );
    if (dupe.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'An increment already exists for that effective_date' });
    }

    // Block if date lies in a finalized payroll period (FINAL/PAID)
    const blocked = await isDateInFinalizedPayrollPeriod(conn, employeeId, effective_date);
    if (blocked) {
      await conn.rollback();
      return res.status(409).json({ error: 'effective_date lies within a finalized payroll period' });
    }

    // Compute previous_salary as of effective_date
    const previousSalary = await getPreviousSalaryAsOf(conn, employeeId, effective_date);

    // Compute new_salary
    let newSalary;
    if (type === 'PERCENT') {
      newSalary = Number(previousSalary) * (1 + Number(value) / 100.0);
    } else {
      newSalary = Number(previousSalary) + Number(value);
    }
    newSalary = Number(newSalary.toFixed(2));

    // Insert increment row
    const [result] = await conn.query(
      `
      INSERT INTO employee_salary_increments
      (employee_id, effective_date, type, value, previous_salary, new_salary, reason, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [employeeId, effective_date, type, value, previousSalary, newSalary, reason, created_by ?? 0]
    );

    // On-write strategy: if effective_date <= today, update employees.salary now
    if (new Date(effective_date) <= new Date(today)) {
      await conn.query(
        `UPDATE employees SET salary = ? WHERE id = ?`,
        [newSalary, employeeId]
      );
    }

    await conn.commit();

    // Return the inserted row
    const [rows] = await dbPromise.query(
      `SELECT * FROM employee_salary_increments WHERE id = ?`,
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    await conn.rollback();
    console.error('Error creating increment:', err);
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Duplicate effective_date for employee' });
    }
    return res.status(500).json({ error: 'Failed to create increment' });
  } finally {
    conn.release();
  }
};


/**
 * GET /api/employees/:employeeId/increments
 */
exports.listIncrements = async (req, res) => {
  try {
    const employeeId = Number(req.params.employeeId);
    const [rows] = await dbPromise.query(
      `
SELECT
  i.id,
  i.employee_id,
  DATE_FORMAT(i.effective_date, '%Y-%m-%d') AS effective_date,
  i.type, i.value, i.previous_salary, i.new_salary, i.reason, i.created_by, i.created_at
FROM employee_salary_increments i
WHERE i.employee_id = ?
ORDER BY i.effective_date DESC, i.id DESC;

      `,
      [employeeId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching increments:', err);
    res.status(500).json({ error: 'Failed to fetch increments' });
  }
};

/**
 * DELETE /api/employees/:employeeId/increments/:id
 * Only allow deletion when:
 * - effective_date > CURDATE()
 * - and not inside a finalized payroll period
 * Never hard-delete past rows.
 */
exports.deleteIncrement = async (req, res) => {
  const employeeId = Number(req.params.employeeId);
  const id = Number(req.params.id);
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // Fetch increment
    const [incRows] = await conn.query(
      `SELECT id, employee_id, effective_date FROM employee_salary_increments WHERE id = ? AND employee_id = ? FOR UPDATE`,
      [id, employeeId]
    );
    if (incRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Increment not found' });
    }
    const { effective_date } = incRows[0];

    const [nowRow] = await conn.query(`SELECT CURDATE() AS today`);
    const today = nowRow[0].today;

    if (!(new Date(effective_date) > new Date(today))) {
      await conn.rollback();
      return res.status(400).json({ error: 'Only future-dated increments can be deleted' });
    }

    const blocked = await isDateInFinalizedPayrollPeriod(conn, employeeId, effective_date);
    if (blocked) {
      await conn.rollback();
      return res.status(409).json({ error: 'Increment falls within a finalized payroll period' });
    }

    await conn.query(
      `DELETE FROM employee_salary_increments WHERE id = ? AND employee_id = ?`,
      [id, employeeId]
    );

    await conn.commit();
    return res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Error deleting increment:', err);
    return res.status(500).json({ error: 'Failed to delete increment' });
  } finally {
    conn.release();
  }
};

/**
 * Optional safety net: nightly sync at 00:05 to copy the latest effective <= today into employees.salary
 * You can call this from a cron or scheduler.
 */
exports.syncEmployeeSalariesToLatestIncrement = async (_req, res) => {
  try {
    const [result] = await dbPromise.query(
      `
      UPDATE employees e
      JOIN (
        SELECT employee_id, MAX(effective_date) AS eff
        FROM employee_salary_increments
        WHERE effective_date <= CURDATE()
        GROUP BY employee_id
      ) last ON last.employee_id = e.id
      JOIN employee_salary_increments i
        ON i.employee_id = e.id AND i.effective_date = last.eff
      SET e.salary = i.new_salary
      `
    );
    res.json({ success: true, affectedRows: result.affectedRows });
  } catch (err) {
    console.error('Error syncing employee salaries:', err);
    res.status(500).json({ error: 'Failed to sync employee salaries' });
  }
};