const { dbPromise } = require('../models/db');

exports.getAllSalaryHistory = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM employee_salary_history ORDER BY change_date DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching salary history', error: err });
  }
};

exports.getHistoryByEmployeeId = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      'SELECT * FROM employee_salary_history WHERE employee_id = ? ORDER BY change_date DESC',
      [req.params.employeeId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching salary history', error: err });
  }
};

exports.logSalaryChange = async (req, res) => {
  const { employee_id, old_salary, new_salary, reason, change_date } = req.body;
  try {
    await dbPromise.query(
      'INSERT INTO employee_salary_history (employee_id, old_salary, new_salary, reason, change_date) VALUES (?, ?, ?, ?, ?)',
      [employee_id, old_salary, new_salary, reason, change_date]
    );
    res.status(201).json({ message: 'Salary change logged' });
  } catch (err) {
    res.status(500).json({ message: 'Error logging salary change', error: err });
  }
};
