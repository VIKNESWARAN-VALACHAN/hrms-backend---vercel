const { dbPromise } = require('../models/db');
const { isValidCidr } = require('../utils/ipValidators');

exports.list = async (req, res) => {
 const raw = req.query.office_id;
  const office_id = raw ? Number(raw) : NaN;
  if (!raw || Number.isNaN(office_id)) {
    return res.status(400).json({ ok: false, error: 'office_id is required' });
  }
  const conn = await dbPromise.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT w.* FROM office_ip_whitelists w
        WHERE w.office_id=? ORDER BY w.id DESC`,
      [office_id]
    );
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.create = async (req, res) => {
  const { office_id, cidr, description, is_active = 1 } = req.body;
  if (!office_id || !cidr) return res.status(400).json({ ok: false, error: 'office_id and cidr are required' });
  if (!isValidCidr(cidr)) return res.status(400).json({ ok: false, error: 'Invalid CIDR' });

  const conn = await dbPromise.getConnection();
  try {
    const [r] = await conn.query(
      `INSERT INTO office_ip_whitelists (office_id, cidr, description, is_active, created_by)
       VALUES (?,?,?,?,?)`,
      [office_id, cidr, description || null, is_active ? 1 : 0, req.user?.id || null]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const { cidr, description, is_active } = req.body;
  if (cidr && !isValidCidr(cidr)) return res.status(400).json({ ok: false, error: 'Invalid CIDR' });

  const conn = await dbPromise.getConnection();
  try {
    await conn.query(
      `UPDATE office_ip_whitelists SET
        cidr=COALESCE(?, cidr),
        description=COALESCE(?, description),
        is_active=COALESCE(?, is_active)
       WHERE id=?`,
      [cidr || null, description || null, (is_active === undefined ? null : (is_active ? 1 : 0)), id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.remove = async (req, res) => {
  const { id } = req.params;
  const conn = await dbPromise.getConnection();
  try {
    await conn.query(`DELETE FROM office_ip_whitelists WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};
