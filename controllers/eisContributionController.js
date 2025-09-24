const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// Get all EIS records
exports.getAllEIS = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM socso_contribution_table WHERE act_type = 'Act800' ORDER BY salary_from ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch EIS contribution data' });
  }
};

// Get one EIS record
exports.getEIS = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM socso_contribution_table WHERE id = ? AND act_type = 'Act800'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch EIS contribution record' });
  }
};

// Create new EIS record
exports.createEIS = async (req, res) => {
  try {
    const { salary_from, salary_to, employee_fixed_amount, employer_fixed_amount } = req.body;
    const sql = `
      INSERT INTO socso_contribution_table 
      (salary_from, salary_to, employee_fixed_amount, employer_fixed_amount, act_type)
      VALUES (?, ?, ?, ?, 'Act800')
    `;
    const [result] = await dbPromise.query(sql, [
      salary_from,
      salary_to,
      employee_fixed_amount,
      employer_fixed_amount
    ]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create EIS contribution record' });
  }
};

// Update EIS record
exports.updateEIS = async (req, res) => {
  try {
    const { salary_from, salary_to, employee_fixed_amount, employer_fixed_amount } = req.body;
    const sql = `
      UPDATE socso_contribution_table SET
        salary_from = ?,
        salary_to = ?,
        employee_fixed_amount = ?,
        employer_fixed_amount = ?
      WHERE id = ? AND act_type = 'Act800'
    `;
    await dbPromise.query(sql, [
      salary_from,
      salary_to,
      employee_fixed_amount,
      employer_fixed_amount,
      req.params.id
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update EIS contribution record' });
  }
};


// Delete EIS record
exports.deleteEIS = async (req, res) => {
  try {
    await dbPromise.query(
      `DELETE FROM socso_contribution_table WHERE id = ? AND act_type = 'Act800'`,
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete EIS contribution record' });
  }
};


// Export to Excel
exports.exportEIS = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM eis_contribution_table ORDER BY salary_from ASC');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('EIS Contribution Table');
    sheet.columns = [
      { header: 'Salary From', key: 'salary_from' },
      { header: 'Salary To', key: 'salary_to' },
      { header: 'Employee %', key: 'employee_percent' },
      { header: 'Employer %', key: 'employer_percent' }
    ];
    sheet.addRows(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=eis_contribution.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export EIS contribution data' });
  }
};
