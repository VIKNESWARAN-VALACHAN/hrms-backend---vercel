// employeeDeductionController.js
const { dbPromise } = require('../models/db');

// Get all deductions with employee info
exports.getAll = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ed.*, e.name AS employee_name, c.name AS company_name, d.department_name,
             dm.name AS deduction_name
      FROM employee_deductions ed
      JOIN employees e ON ed.employee_id = e.id
      LEFT JOIN companies c ON e.company_id = c.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN deduction_master dm ON ed.deduction_id = dm.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get by ID
exports.getById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ed.*, e.name AS employee_name, dm.name AS deduction_name
      FROM employee_deductions ed
      JOIN employees e ON ed.employee_id = e.id
      JOIN deduction_master dm ON ed.deduction_id = dm.id
      WHERE ed.id = ?
    `, [req.params.id]);
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Create
exports.create = async (req, res) => {
  try {
    const { employee_id, deduction_id, amount, is_recurring, effective_date, end_date } = req.body;
    const [result] = await dbPromise.query(
      `INSERT INTO employee_deductions (employee_id, deduction_id, amount, is_recurring, effective_date, end_date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [employee_id, deduction_id, amount, is_recurring, effective_date, end_date]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
// Update
exports.update = async (req, res) => {
  try {
    const {
      employee_id,
      deduction_id,
      amount,
      is_recurring,
      effective_date,
      end_date
    } = req.body;

    console.log('Update Payload:', req.body);

    if (!employee_id || !deduction_id || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const recurringValue = is_recurring ? 1 : 0;

    const [result] = await dbPromise.query(
      `UPDATE employee_deductions 
       SET employee_id=?, deduction_id=?, amount=?, is_recurring=?, effective_date=?, end_date=?, updated_at=NOW()
       WHERE id=?`,
      [
        employee_id,
        deduction_id,
        amount,
        recurringValue,
        effective_date || null,
        end_date || null,
        req.params.id
      ]
    );

    res.json({ updated: result.affectedRows });
  } catch (err) {
    console.error('Update Error:', err);
    res.status(500).json({ error: 'Failed to update employee deduction' });
  }
};


// Delete
exports.remove = async (req, res) => {
  try {
    const [result] = await dbPromise.query(`DELETE FROM employee_deductions WHERE id = ?`, [req.params.id]);
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
