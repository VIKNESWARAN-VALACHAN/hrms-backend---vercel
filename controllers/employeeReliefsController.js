const { dbPromise } = require('../models/db');

// Get all
exports.getAll = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT er.*, e.name AS employee_name, rc.name AS relief_name, rc.amount AS relief_amount
      FROM employee_reliefs er
      JOIN employees e ON er.employee_id = e.id
      JOIN relief_categories rc ON er.relief_id = rc.id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get by ID
exports.getById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT er.*, rc.name AS relief_name, rc.amount AS relief_amount
      FROM employee_reliefs er
      JOIN relief_categories rc ON rc.id = er.relief_id
      WHERE er.employee_id = ?`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'No reliefs found for this employee' });

    res.json(rows); 
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Create
exports.create = async (req, res) => {
  try {
    const { employee_id, relief_id } = req.body;
    if (!employee_id || !relief_id) return res.status(400).json({ error: 'employee_id and relief_id required' });

    const [result] = await dbPromise.query(
      `INSERT INTO employee_reliefs (employee_id, relief_id, created_at, updated_at)
       VALUES (?, ?, NOW(), NOW())`,
      [employee_id, relief_id]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update
// Update all reliefs of an employee
exports.update = async (req, res) => {
  const { employee_id, reliefs } = req.body;

  if (!employee_id || !Array.isArray(reliefs)) {
    return res.status(400).json({ error: 'Invalid request format' });
  }

  const conn = await dbPromise.getConnection();
  await conn.beginTransaction();

  try {
    // 1. Get current relief IDs in DB
    const [existingRows] = await conn.query(
      `SELECT id FROM employee_reliefs WHERE employee_id = ?`,
      [employee_id]
    );
    const existingIds = existingRows.map(row => row.id);

    const sentIds = reliefs.filter(r => r.id).map(r => r.id);

    // 2. Delete removed reliefs
    const toDelete = existingIds.filter(id => !sentIds.includes(id));
    if (toDelete.length) {
      await conn.query(
        `DELETE FROM employee_reliefs WHERE id IN (?)`,
        [toDelete]
      );
    }

    // 3. Update existing reliefs
    for (const r of reliefs) {
      if (r.id) {
        await conn.query(
          `UPDATE employee_reliefs SET relief_id = ?, updated_at = NOW() WHERE id = ? AND employee_id = ?`,
          [r.relief_id, r.id, employee_id]
        );
      } else {
        // 4. Insert new reliefs
        await conn.query(
          `INSERT INTO employee_reliefs (employee_id, relief_id, created_at, updated_at) VALUES (?, ?, NOW(), NOW())`,
          [employee_id, r.relief_id]
        );
      }
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    res.status(500).json({ error: err.message });
  } finally {
    conn.release();
  }
};


// Delete
exports.remove = async (req, res) => {
  try {
    const [result] = await dbPromise.query(`DELETE FROM employee_reliefs WHERE employee_id = ?`, [req.params.id]);
    res.json({ deleted: result.affectedRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
