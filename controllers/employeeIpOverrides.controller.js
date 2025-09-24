const { dbPromise } = require('../models/db');
const { isValidIp } = require('../utils/ipValidators');

exports.listByEmployee = async (req, res) => {
  const { employee_id } = req.query;
  if (!employee_id) return res.status(400).json({ ok: false, error: 'employee_id is required' });

  const conn = await dbPromise.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT * FROM employee_ip_overrides WHERE employee_id=? ORDER BY id DESC`, [employee_id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.create = async (req, res) => {
  try {
    const { employee_id, ip_address, label } = req.body || {};
    if (!employee_id || !ip_address) {
      return res.status(400).json({ ok: false, error: 'employee_id and ip_address are required' });
    }
    if (!isValidIp(String(ip_address).trim())) {
      return res.status(400).json({ ok: false, error: 'Invalid IP address' });
    }

    const conn = await dbPromise.getConnection();
    try {
      const [r] = await conn.query(
        `INSERT INTO employee_ip_overrides (employee_id, ip_address, label, is_active)
         VALUES (?,?,?,1)`,
        [employee_id, String(ip_address).trim(), label || null]
      );
      return res.json({ ok: true, id: r.insertId });
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ ok: false, error: 'This IP is already assigned to the employee' });
      }
      if (e.code === 'ER_NO_REFERENCED_ROW_2' || e.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(400).json({ ok: false, error: 'Invalid employee_id (FK failed)' });
      }
      return res.status(500).json({ ok: false, error: e.message });
    } finally {
      conn.release();
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
};


exports.remove = async (req, res) => {
  const { id } = req.params;
  const conn = await dbPromise.getConnection();
  try {
    await conn.query(`DELETE FROM employee_ip_overrides WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};
