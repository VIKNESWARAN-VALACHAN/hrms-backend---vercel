const { dbPromise } = require('../models/db');

// List all assignments
exports.getAll = async (req, res) => {
  const [rows] = await dbPromise.query(`
SELECT
  ppa.*,
  pc.pay_interval,
  pc.cutoff_day,
  pc.payment_day,
  pc.late_penalty_type,
  pc.late_penalty_amount,
  pc.ot_multiplier,
  pc.default_currency,
  pc.auto_carry_forward,
  c.name AS company_name,
  d.department_name
FROM payroll_policy_assignment ppa
JOIN payroll_config pc ON ppa.payroll_config_id = pc.id
JOIN companies c ON ppa.company_id = c.id
LEFT JOIN departments d ON ppa.department_id = d.id
ORDER BY ppa.id DESC;
`);
res.json(rows);
};

// Get one
exports.getOne = async (req, res) => {
  const [rows] = await dbPromise.query('SELECT * FROM payroll_policy_assignment WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
};

// Create
exports.create1 = async (req, res) => {
  const {
    payroll_config_id, company_id, department_id, branch_id,
    start_date, end_date, is_active
  } = req.body;
  const [result] = await dbPromise.query(
    `INSERT INTO payroll_policy_assignment
      (payroll_config_id, company_id, department_id, branch_id, start_date, end_date, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [payroll_config_id, company_id, department_id, branch_id, start_date, end_date, is_active]
  );
  res.status(201).json({ id: result.insertId });
};

// Create
exports.create = async (req, res) => {
  try {
    const {
      payroll_config_id, company_id, department_id, branch_id,
      start_date, end_date, is_active
    } = req.body;
    if (!payroll_config_id || !company_id || !start_date) {
      return res.status(400).json({ error: 'Missing required fields: payroll_config_id, company_id, and start_date are mandatory.' });
    }

    const final_start_date = (start_date === '' || start_date === undefined) ? null : start_date;
    if (final_start_date === null) {
      return res.status(400).json({ error: 'Start date cannot be empty.' });
    }
   
    const final_end_date = (end_date === '' || end_date === undefined) ? null : end_date;

    const [result] = await dbPromise.query(
      `INSERT INTO payroll_policy_assignment
        (payroll_config_id, company_id, department_id, branch_id, start_date, end_date, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [payroll_config_id, company_id, department_id, branch_id, final_start_date, final_end_date, is_active]
    );

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Create error:', err); 
    res.status(500).json({
      error: 'Failed to create payroll policy assignment',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined // Show details only in dev
    });
  }
};

// Update
exports.update1 = async (req, res) => {
  const id = req.params.id;
  if (!id || id === 'undefined') {
    return res.status(400).json({ error: 'Invalid ID in request.' });
  }
  const {
    payroll_config_id, company_id, department_id, branch_id,
    start_date, end_date, is_active
  } = req.body;
  await dbPromise.query(
    `UPDATE payroll_policy_assignment SET
      payroll_config_id=?, company_id=?, department_id=?, branch_id=?,
      start_date=?, end_date=?, is_active=?
      WHERE id=?`,
    [payroll_config_id, company_id, department_id, branch_id, start_date, end_date, is_active, id]
  );
  res.json({ success: true });
};

exports.update = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id || id === 'undefined') {
      return res.status(400).json({ error: 'Invalid ID in request.' });
    }

    const {
      payroll_config_id, company_id, department_id, branch_id,
      start_date, end_date, is_active
    } = req.body;

    // --- Input Validation and Date Handling (Same as create) ---

    // Validate required fields
    if (!payroll_config_id || !company_id || !start_date) {
      return res.status(400).json({ error: 'Missing required fields: payroll_config_id, company_id, and start_date are mandatory.' });
    }

    // Ensure start_date is a valid string, or handle error if it's unexpectedly empty
    const final_start_date = (start_date === '' || start_date === undefined) ? null : start_date;
    if (final_start_date === null) {
      return res.status(400).json({ error: 'Start date cannot be empty.' });
    }

    // Explicitly convert empty string or undefined for end_date to null
    const final_end_date = (end_date === '' || end_date === undefined) ? null : end_date;

    // --- Database Update ---
    const [result] = await dbPromise.query(
      `UPDATE payroll_policy_assignment SET
        payroll_config_id=?, company_id=?, department_id=?, branch_id=?,
        start_date=?, end_date=?, is_active=?
        WHERE id=?`,
      [payroll_config_id, company_id, department_id, branch_id, final_start_date, final_end_date, is_active, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Payroll policy assignment not found.' });
    }

    res.json({ success: true, message: 'Payroll policy assignment updated successfully.' });
  } catch (err) {
    console.error('Update error:', err); // Log the full error for debugging
    res.status(500).json({
      error: 'Failed to update payroll policy assignment',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined // Show details only in dev
    });
  }
};

// Delete
exports.delete = async (req, res) => {
  await dbPromise.query('DELETE FROM payroll_policy_assignment WHERE id=?', [req.params.id]);
  res.json({ success: true });
};
