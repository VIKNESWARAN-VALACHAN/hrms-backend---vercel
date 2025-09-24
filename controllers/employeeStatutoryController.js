const { dbPromise } = require('../models/db');

exports.getAllStatutoryConfigs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM employee_statutory_config');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching statutory configs', error: err });
  }
};

exports.getStatutoryByEmployeeId = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM employee_statutory_config WHERE employee_id = ?', [req.params.employeeId]);
    res.json(rows[0] || {});
  } catch (err) {
    res.status(500).json({ message: 'Error fetching employee statutory config', error: err });
  }
};

exports.createStatutoryConfig = async (req, res) => {
  const { employee_id, epf_no, socso_no, eis_no } = req.body;
  try {
    await dbPromise.query(
      'INSERT INTO employee_statutory_config (employee_id, epf_no, socso_no, eis_no) VALUES (?, ?, ?, ?)',
      [employee_id, epf_no, socso_no, eis_no]
    );
    res.status(201).json({ message: 'Statutory config created' });
  } catch (err) {
    res.status(500).json({ message: 'Error creating statutory config', error: err });
  }
};

exports.updateStatutoryConfig = async (req, res) => {
  const { epf_no, socso_no, eis_no } = req.body;
  try {
    await dbPromise.query(
      'UPDATE employee_statutory_config SET epf_no = ?, socso_no = ?, eis_no = ? WHERE employee_id = ?',
      [epf_no, socso_no, eis_no, req.params.employeeId]
    );
    res.json({ message: 'Statutory config updated' });
  } catch (err) {
    res.status(500).json({ message: 'Error updating statutory config', error: err });
  }
};

exports.deleteStatutoryConfig = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM employee_statutory_config WHERE employee_id = ?', [req.params.employeeId]);
    res.json({ message: 'Statutory config deleted' });
  } catch (err) {
    res.status(500).json({ message: 'Error deleting statutory config', error: err });
  }
};
