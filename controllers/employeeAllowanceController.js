// controllers/employeeAllowanceController.js
const { dbPromise } = require('../models/db');


exports.list = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
        SELECT 
            ea.id,
            ea.employee_id,
            ea.allowance_id,
            ea.amount,
            ea.is_recurring,
            DATE_FORMAT(ea.effective_date, '%Y-%m-%d') AS effective_date,
            DATE_FORMAT(ea.end_date, '%Y-%m-%d') AS end_date,
            ea.created_at,
            ea.updated_at,
            e.name AS employee_name, 
            c.name AS company_name, 
            d.department_name AS department_name,
            am.name AS allowance_name
        FROM employee_allowances ea
        JOIN employees e ON ea.employee_id = e.id
        LEFT JOIN companies c ON e.company_id = c.id
        LEFT JOIN departments d ON e.department_id = d.id
        JOIN allowance_master am ON ea.allowance_id = am.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.listForEmployee = async (req, res) => {
  try {
    const employeeId = req.params.employeeId || req.params.employee_id;

    const [rows] = await dbPromise.query(`
      SELECT 
        ea.id,
        ea.employee_id,
        ea.allowance_id,
        ea.amount,
        ea.is_recurring,
        DATE_FORMAT(ea.effective_date, '%Y-%m-%d') AS effective_date,
        DATE_FORMAT(ea.end_date, '%Y-%m-%d') AS end_date,
        ea.created_at,
        ea.updated_at,
        e.name AS employee_name, 
        c.name AS company_name, 
        d.department_name AS department_name,
        am.name AS allowance_name
      FROM employee_allowances ea
      JOIN employees e ON ea.employee_id = e.id
      LEFT JOIN companies c ON e.company_id = c.id
      LEFT JOIN departments d ON e.department_id = d.id
      JOIN allowance_master am ON ea.allowance_id = am.id
      WHERE ea.employee_id = ?
      ORDER BY ea.effective_date DESC, ea.created_at DESC
    `, [employeeId]);

    res.json(rows); // [] if none
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.get = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ea.*, a.name AS allowance_name
      FROM employee_allowances ea
      JOIN allowance_master a ON ea.allowance_id = a.id
      WHERE ea.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { employee_id, allowance_id, amount, is_recurring, effective_date, end_date } = req.body;
    const [result] = await dbPromise.query(
      `INSERT INTO employee_allowances (employee_id, allowance_id, amount, is_recurring, effective_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [employee_id, allowance_id, amount, is_recurring, effective_date, end_date]
    );
    res.json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.update = async (req, res) => {
  try {
    const { employee_id, allowance_id, amount, is_recurring, effective_date, end_date } = req.body;
    
    // Convert empty strings to NULL for date fields
    const processedEffectiveDate = effective_date === '' || effective_date === null ? null : effective_date;
    const processedEndDate = end_date === '' || end_date === null ? null : end_date;
    
    const [result] = await dbPromise.query(
      `UPDATE employee_allowances
       SET employee_id = ?, allowance_id = ?, amount = ?, is_recurring = ?, effective_date = ?, end_date = ?, updated_at = NOW()
       WHERE id = ?`,
      [employee_id, allowance_id, amount, is_recurring, processedEffectiveDate, processedEndDate, req.params.id]
    );
    res.json({ updated: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


exports.remove = async (req, res) => {
  try {
    const [result] = await dbPromise.query(`DELETE FROM employee_allowances WHERE id = ?`, [req.params.id]);
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
