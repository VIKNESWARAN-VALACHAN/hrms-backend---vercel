// const { dbPromise } = require('../models/db');

// // List all allowance assignments (optionally filter by payroll_config_id)
// exports.getAll = async (req, res) => {
//   const { payroll_config_id } = req.query;
//   let sql = `
//     SELECT 
//       a.*, 
//       am.name AS allowance_name,
//       pc.pay_interval AS payroll_config_name,
//       c.name AS company_name,
//       d.department_name AS department_name
//     FROM payroll_config_allowance a
//     JOIN allowance_master am ON a.allowance_id = am.id
//     LEFT JOIN payroll_config pc ON a.payroll_config_id = pc.id
//     LEFT JOIN companies c ON a.company_id = c.id
//     LEFT JOIN departments d ON a.department_id = d.id
//     WHERE 1=1
//   `;
//   const params = [];
//   if (payroll_config_id) {
//     sql += ' AND a.payroll_config_id = ?';
//     params.push(payroll_config_id);
//   }
//   const [rows] = await dbPromise.query(sql, params);
//   res.json(rows);
// };

// // Get one
// exports.getOne = async (req, res) => {
//   const [rows] = await dbPromise.query(
//     `
//     SELECT 
//       a.*, 
//       am.name AS allowance_name,
//       pc.pay_interval AS payroll_config_name,
//       c.name AS company_name,
//       d.department_name AS department_name
//     FROM payroll_config_allowance a
//     JOIN allowance_master am ON a.allowance_id = am.id
//     LEFT JOIN payroll_config pc ON a.payroll_config_id = pc.id
//     LEFT JOIN companies c ON a.company_id = c.id
//     LEFT JOIN departments d ON a.department_id = d.id
//     WHERE a.id = ?
//     `,
//     [req.params.id]
//   );
//   if (!rows.length) return res.status(404).json({ error: 'Not found' });
//   res.json(rows[0]);
// };

// // Create
// exports.create = async (req, res) => {
//   try {
//     const {
//       payroll_config_id, allowance_id, is_default = 1, amount,
//       company_id = null, department_id = null, branch_id = null,
//       cycle_months = null, cycle_start_month = null,
//     } = req.body;

//     if (!payroll_config_id || !allowance_id) {
//       return res.status(400).json({ error: 'payroll_config_id and allowance_id are required' });
//     }

//     const [result] = await dbPromise.query(
//       `INSERT INTO payroll_config_allowance
//         (payroll_config_id, allowance_id, is_default, amount, company_id, department_id, branch_id, cycle_months, cycle_start_month)
//         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//       [payroll_config_id, allowance_id, is_default, amount, company_id, department_id, branch_id, cycle_months, cycle_start_month]
//     );
//     res.status(201).json({ id: result.insertId });
//   } catch (err) {
//     console.error('Create mapping error:', err);
//     res.status(500).json({ error: err.message || 'Failed to create mapping' });
//   }
// };

// // Update
// exports.update = async (req, res) => {
//   const {
//     payroll_config_id, allowance_id, is_default, amount,
//     company_id, department_id, branch_id,
//     cycle_months = null, cycle_start_month = null,
//   } = req.body;
//   await dbPromise.query(
//     `UPDATE payroll_config_allowance SET
//       payroll_config_id=?, allowance_id=?, is_default=?, amount=?,
//       company_id=?, department_id=?, branch_id=?, cycle_months=?, cycle_start_month=?
//       WHERE id=?`,
//     [payroll_config_id, allowance_id, is_default, amount, company_id, department_id, branch_id, cycle_months, cycle_start_month, req.params.id]
//   );
//   res.json({ success: true });
// };

// // Delete
// exports.delete = async (req, res) => {
//   await dbPromise.query('DELETE FROM payroll_config_allowance WHERE id=?', [req.params.id]);
//   res.json({ success: true });
// };

const { dbPromise } = require('../models/db');

// List all allowance assignments (optionally filter by payroll_config_id)
exports.getAll = async (req, res) => {
  const { payroll_config_id } = req.query;
  let sql = `
    SELECT 
      a.*, 
      am.name AS allowance_name,
      pc.pay_interval AS payroll_config_name,
      c.name AS company_name,
      d.department_name AS department_name
    FROM payroll_config_allowance a
    JOIN allowance_master am ON a.allowance_id = am.id
    LEFT JOIN payroll_config pc ON a.payroll_config_id = pc.id
    LEFT JOIN companies c ON a.company_id = c.id
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE 1=1
  `;
  const params = [];
  if (payroll_config_id) {
    sql += ' AND a.payroll_config_id = ?';
    params.push(payroll_config_id);
  }
  const [rows] = await dbPromise.query(sql, params);
  res.json(rows);
};

// Get one
exports.getOne = async (req, res) => {
  const [rows] = await dbPromise.query(
    `
    SELECT 
      a.*, 
      am.name AS allowance_name,
      pc.pay_interval AS payroll_config_name,
      c.name AS company_name,
      d.department_name AS department_name
    FROM payroll_config_allowance a
    JOIN allowance_master am ON a.allowance_id = am.id
    LEFT JOIN payroll_config pc ON a.payroll_config_id = pc.id
    LEFT JOIN companies c ON a.company_id = c.id
    LEFT JOIN departments d ON a.department_id = d.id
    WHERE a.id = ?
    `,
    [req.params.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  res.json(rows[0]);
};

// Create
exports.create = async (req, res) => {
  try {
    const {
      payroll_config_id, allowance_id, is_default = 1, amount,
      remark = null,
      company_id = null, department_id = null, branch_id = null,
      cycle_start_month = null, cycle_end_month = null
    } = req.body;

    if (!payroll_config_id || !allowance_id) {
      return res.status(400).json({ error: 'payroll_config_id and allowance_id are required' });
    }

    const [result] = await dbPromise.query(
      `INSERT INTO payroll_config_allowance
        (payroll_config_id, allowance_id, is_default, amount, remark, company_id, department_id, branch_id, cycle_start_month, cycle_end_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payroll_config_id, allowance_id, is_default, amount, remark, company_id, department_id, branch_id, cycle_start_month, cycle_end_month]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Create mapping error:', err);
    res.status(500).json({ error: err.message || 'Failed to create mapping' });
  }
};

const formatDateToMySQL = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0]; // Convert to YYYY-MM-DD
};

// Update
exports.update = async (req, res) => {
  const {
    payroll_config_id, allowance_id, is_default, amount,
    company_id, department_id, branch_id,
    cycle_start_month = null, cycle_end_month = null,
    remark = null
  } = req.body;

  const formattedStart = formatDateToMySQL(cycle_start_month);
  const formattedEnd = formatDateToMySQL(cycle_end_month);

  await dbPromise.query(
    `UPDATE payroll_config_allowance SET
      payroll_config_id=?, allowance_id=?, is_default=?, amount=?, remark=?,
      company_id=?, department_id=?, branch_id=?, cycle_start_month=?, cycle_end_month=?
      WHERE id=?`,
    [
      payroll_config_id, allowance_id, is_default, amount, remark,
      company_id, department_id, branch_id, formattedStart, formattedEnd,
      req.params.id
    ]
  );
  res.json({ success: true });
};

// Delete
exports.delete = async (req, res) => {
  await dbPromise.query('DELETE FROM payroll_config_allowance WHERE id=?', [req.params.id]);
  res.json({ success: true });
};
