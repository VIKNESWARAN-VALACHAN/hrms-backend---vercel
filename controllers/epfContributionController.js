const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// List all EPF brackets
exports.getAllEPF = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM epf_contribution_table ORDER BY salary_from ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch EPF contribution data' });
  }
};

// Get one EPF bracket
exports.getEPF = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM epf_contribution_table WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch EPF contribution record' });
  }
};

// Create EPF bracket
exports.createEPF = async (req, res) => {
  try {
    const { salary_from, salary_to, employee_percent, employer_percent, age_limit } = req.body;
    const sql = `INSERT INTO epf_contribution_table (salary_from, salary_to, employee_percent, employer_percent, age_limit)
                 VALUES (?, ?, ?, ?, ?)`;
    const [result] = await dbPromise.query(sql, [
      salary_from, salary_to, employee_percent, employer_percent, age_limit || null
    ]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create EPF contribution record' });
  }
};

// Update EPF bracket
exports.updateEPF = async (req, res) => {
  try {
    const { salary_from, salary_to, employee_percent, employer_percent, age_limit } = req.body;
    const sql = `UPDATE epf_contribution_table SET 
                   salary_from = ?, salary_to = ?, employee_percent = ?, employer_percent = ?, age_limit = ?
                 WHERE id = ?`;
    await dbPromise.query(sql, [
      salary_from, salary_to, employee_percent, employer_percent, age_limit || null, req.params.id
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update EPF contribution record' });
  }
};

// Delete EPF bracket
exports.deleteEPF = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM epf_contribution_table WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete EPF contribution record' });
  }
};

// Export to Excel
exports.exportEPF = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM epf_contribution_table ORDER BY salary_from ASC');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('EPF Contribution Table');
    sheet.columns = [
      { header: 'Salary From', key: 'salary_from' },
      { header: 'Salary To', key: 'salary_to' },
      { header: 'Employee %', key: 'employee_percent' },
      { header: 'Employer %', key: 'employer_percent' },
      { header: 'Age Limit', key: 'age_limit' }
    ];
    sheet.addRows(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=epf_contribution.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export EPF contribution data' });
  }
};
