// const { dbPromise } = require('../models/db');

// // List all deduction assignments (optionally filter by payroll_config_id)
// exports.getAll = async (req, res) => {
//   const { payroll_config_id } = req.query;
//   let sql = `SELECT 
//           d.*, 
//           dm.name AS deduction_name, 
//           c.name AS company_name, 
//           dept.department_name AS department_name
//         FROM payroll_config_deduction d
//         JOIN deduction_master dm ON d.deduction_id = dm.id
//         LEFT JOIN companies c ON d.company_id = c.id
//         LEFT JOIN departments dept ON d.department_id = dept.id
//         WHERE 1=1;`;
//   const params = [];
//   if (payroll_config_id) {
//     sql += ' AND d.payroll_config_id = ?';
//     params.push(payroll_config_id);
//   }
//   const [rows] = await dbPromise.query(sql, params);
//   res.json(rows);
// };

// // Get one
// exports.getOne = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(
//       `
//       SELECT 
//         d.*, 
//         dm.name AS deduction_name, 
//         c.name AS company_name, 
//         dept.department_name AS department_name
//       FROM payroll_config_deduction d
//       JOIN deduction_master dm ON d.deduction_id = dm.id
//       LEFT JOIN companies c ON d.company_id = c.id
//       LEFT JOIN departments dept ON d.department_id = dept.id
//       WHERE d.id = ?
//       `,
//       [req.params.id]
//     );

//     if (!rows.length) return res.status(404).json({ error: 'Not found' });

//     res.json(rows[0]);
//   } catch (err) {
//     console.error('Error fetching deduction config:', err);
//     res.status(500).json({ error: 'Internal server error' });
//   }
// };


// exports.create = async (req, res) => {
//   try {
//     const {
//       payroll_config_id, deduction_id, is_default, amount, company_id, department_id,
//       cycle_months = null, cycle_start_month = null // new
//     } = req.body;
//     if (!payroll_config_id || !deduction_id || amount === undefined) {
//       return res.status(400).json({ error: 'Missing required fields.' });
//     }
//     const [result] = await dbPromise.query(
//       `INSERT INTO payroll_config_deduction (payroll_config_id, deduction_id, is_default, amount, company_id, department_id, cycle_months, cycle_start_month)
//       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
//       [payroll_config_id, deduction_id, is_default || 1, amount, company_id || null, department_id || null, cycle_months, cycle_start_month]
//     );
//     res.status(201).json({ id: result.insertId, ...req.body });
//   } catch (err) {
//     console.error('Create error', err);
//     res.status(500).json({ error: 'Insert failed' });
//   }
// };


// exports.update = async (req, res) => {
//   const { id } = req.params;
  
//   try {
//     // Check if record exists
//     const [check] = await dbPromise.query(
//       `SELECT id FROM payroll_config_deduction WHERE id = ?`,
//       [id]
//     );
    
//     if (!check.length) {
//       return res.status(404).json({ error: 'Record not found' });
//     }

//     // Execute update - REMOVED THE COMMENT FROM SQL STRING
//     await dbPromise.query(
//       `UPDATE payroll_config_deduction SET
//         payroll_config_id = ?,
//         deduction_id = ?,
//         is_default = ?,
//         amount = ?,
//         company_id = ?,
//         department_id = ?,
//         cycle_months = ?,
//         cycle_start_month = ?,
//         updated_at = NOW()
//       WHERE id = ?`,
//       [
//         req.body.payroll_config_id,
//         req.body.deduction_id,
//         req.body.is_default || 0,
//         req.body.amount,
//         req.body.company_id || null,
//         req.body.department_id || null,
//         req.body.cycle_months || null,
//         req.body.cycle_start_month || null,
//         id
//       ]
//     );

//     res.json({ 
//       success: true, 
//       message: 'Updated successfully',
//       data: { id, ...req.body }
//     });
    
//   } catch (err) {
//     console.error('Update error:', err);
//     res.status(500).json({ 
//       error: 'Internal server error',
//       details: process.env.NODE_ENV === 'development' ? err.message : undefined
//     });
//   }
// };
// // Delete
// exports.delete = async (req, res) => {
//   await dbPromise.query('DELETE FROM payroll_config_deduction WHERE id=?', [req.params.id]);
//   res.json({ success: true });
// };

const { dbPromise } = require('../models/db');




function toDateOnly(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0]; // "YYYY-MM-DD"
  } catch {
    return null;
  }
}

// List all deduction assignments (optionally filter by payroll_config_id)
exports.getAll = async (req, res) => {
  const { payroll_config_id } = req.query;
  let sql = `SELECT 
          d.*, 
          dm.name AS deduction_name, 
          c.name AS company_name, 
          dept.department_name AS department_name
        FROM payroll_config_deduction d
        JOIN deduction_master dm ON d.deduction_id = dm.id
        LEFT JOIN companies c ON d.company_id = c.id
        LEFT JOIN departments dept ON d.department_id = dept.id
        WHERE 1=1`;
  const params = [];
  if (payroll_config_id) {
    sql += ' AND d.payroll_config_id = ?';
    params.push(payroll_config_id);
  }
  const [rows] = await dbPromise.query(sql, params);
  res.json(rows);
};

// Get one
exports.getOne = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `
      SELECT 
        d.*, 
        dm.name AS deduction_name, 
        c.name AS company_name, 
        dept.department_name AS department_name
      FROM payroll_config_deduction d
      JOIN deduction_master dm ON d.deduction_id = dm.id
      LEFT JOIN companies c ON d.company_id = c.id
      LEFT JOIN departments dept ON d.department_id = dept.id
      WHERE d.id = ?
      `,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching deduction config:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Create
exports.create = async (req, res) => {
  try {
    const {
      payroll_config_id, deduction_id, is_default, amount,
      company_id, department_id, branch_id, remark,
      cycle_start_month, cycle_end_month
    } = req.body;

    if (!payroll_config_id || !deduction_id || amount === undefined) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const formattedCycleStart = toDateOnly(cycle_start_month);
    const formattedCycleEnd = toDateOnly(cycle_end_month);

    const [result] = await dbPromise.query(
      `INSERT INTO payroll_config_deduction (
        payroll_config_id, deduction_id, is_default, amount, company_id,
        department_id, branch_id, remark, cycle_end_month, cycle_start_month
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payroll_config_id,
        deduction_id,
        is_default || 1,
        amount,
        company_id || null,
        department_id || null,
        branch_id || null,
        remark || null,
        formattedCycleEnd,
        formattedCycleStart
      ]
    );

    res.status(201).json({ id: result.insertId, ...req.body });
  } catch (err) {
    console.error('Create error', err);
    res.status(500).json({ error: 'Insert failed' });
  }
};



// Update

exports.update = async (req, res) => {
  const { id } = req.params;

  try {
    const [check] = await dbPromise.query(
      `SELECT id FROM payroll_config_deduction WHERE id = ?`,
      [id]
    );

    if (!check.length) {
      return res.status(404).json({ error: 'Record not found' });
    }

    // ✅ Ensure only 'YYYY-MM-DD' is passed to MySQL
    const cycleStart = toDateOnly(req.body.cycle_start_month);
    const cycleEnd = toDateOnly(req.body.cycle_end_month);

    await dbPromise.query(
      `UPDATE payroll_config_deduction SET
        payroll_config_id = ?,
        deduction_id = ?,
        is_default = ?,
        amount = ?,
        company_id = ?,
        department_id = ?,
        branch_id = ?,
        remark = ?,
        cycle_end_month = ?,
        cycle_start_month = ?,
        updated_at = NOW()
      WHERE id = ?`,
      [
        req.body.payroll_config_id,
        req.body.deduction_id,
        req.body.is_default || 0,
        req.body.amount,
        req.body.company_id || null,
        req.body.department_id || null,
        req.body.branch_id || null,
        req.body.remark || null,
        cycleEnd,
        cycleStart,
        id
      ]
    );

    res.json({
      success: true,
      message: 'Updated successfully',
      data: { id, ...req.body }
    });

  } catch (err) {
    console.error('Update error:', err);
    res.status(500).json({
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

exports.delete = async (req, res) => {
  console.log('Trying to delete ID:', req.params.id);
  try {
    const [check] = await dbPromise.query('SELECT * FROM payroll_config_deduction WHERE id = ?', [req.params.id]);
    if (check.length === 0) return res.status(404).json({ error: 'Record not found' });

    await dbPromise.query('DELETE FROM payroll_config_deduction WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
};

