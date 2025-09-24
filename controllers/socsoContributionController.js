const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// List all SOCSO brackets
exports.getAllSOCSO = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM socso_contribution_table WHERE act_type = 'Act4' ORDER BY salary_from ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SOCSO contribution data' });
  }
};

// Get one SOCSO bracket
exports.getSOCSO = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM socso_contribution_table WHERE id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch SOCSO contribution record' });
  }
};

// Create SOCSO bracket — default act_type = 'Act4' if missing
exports.createSOCSO = async (req, res) => {
  try {
    const {
      salary_from,
      salary_to,
      employee_fixed_amount,
      employer_fixed_amount,
      act_type
    } = req.body;

    const sql = `
      INSERT INTO socso_contribution_table (
        salary_from, salary_to,
        employee_fixed_amount, employer_fixed_amount,
        act_type
      )
      VALUES (?, ?, ?, ?, ?)
    `;

    const [result] = await dbPromise.query(sql, [
      salary_from,
      salary_to,
      employee_fixed_amount,
      employer_fixed_amount,
      act_type || 'Act4'
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create SOCSO contribution record' });
  }
};

// Update SOCSO bracket — act_type default fallback to 'Act4'
exports.updateSOCSO = async (req, res) => {
  try {
    const { salary_from, salary_to, employee_fixed_amount, employer_fixed_amount, act_type } = req.body;

    const sql = `UPDATE socso_contribution_table SET 
      salary_from = ?, 
      salary_to = ?, 
      employee_fixed_amount = ?, 
      employer_fixed_amount = ?, 
      act_type = ?
      WHERE id = ?`;

    await dbPromise.query(sql, [
      salary_from,
      salary_to,
      employee_fixed_amount,
      employer_fixed_amount,
      act_type || 'Act4',
      req.params.id,
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating SOCSO:', err);
    res.status(500).json({ error: 'Failed to update SOCSO record' });
  }
};


// Delete SOCSO bracket
exports.deleteSOCSO = async (req, res) => {
  try {
    await dbPromise.query(
      'DELETE FROM socso_contribution_table WHERE id = ?',
      [req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete SOCSO contribution record' });
  }
};

// Export to Excel
exports.exportSOCSO = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM socso_contribution_table ORDER BY salary_from ASC');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('SOCSO Contribution Table');
    sheet.columns = [
      { header: 'Salary From', key: 'salary_from' },
      { header: 'Salary To', key: 'salary_to' },
      { header: 'Employee %', key: 'employee_percent' },
      { header: 'Employer %', key: 'employer_percent' },
      { header: 'Category', key: 'category' } // Omit if your table doesn't have it
    ];
    sheet.addRows(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=socso_contribution.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'Failed to export SOCSO contribution data' });
  }
};
