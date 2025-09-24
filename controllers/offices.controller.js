const { dbPromise } = require('../models/db');

exports.list = async (req, res) => {
  const conn = await dbPromise.getConnection();
  try {
    const { company_id } = req.query; // optional filter
    let sql = `SELECT * FROM offices`;
    const params = [];
    if (company_id) { sql += ` WHERE company_id=?`; params.push(company_id); }
    sql += ` ORDER BY company_id, name`;
    const [rows] = await conn.query(sql, params);
    res.json({ ok: true, data: rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.create = async (req, res) => {
  const {
    company_id, name, address_line1, address_line2, city, state, country,
    postcode, lat, lng, timezone, is_active = 1
  } = req.body;
  if (!company_id || !name) {
    return res.status(400).json({ ok: false, error: 'company_id and name are required' });
  }
  const conn = await dbPromise.getConnection();
  try {
    const [r] = await conn.query(
      `INSERT INTO offices (company_id, name, address_line1, address_line2, city, state, country, postcode, lat, lng, timezone, is_active)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [company_id, name, address_line1 || null, address_line2 || null, city || null, state || null, country || null,
       postcode || null, lat || null, lng || null, timezone || null, is_active ? 1 : 0]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};

exports.update = async (req, res) => {
  const { id } = req.params;
  const b = req.body;
  const conn = await dbPromise.getConnection();
  try {
    await conn.query(
      `UPDATE offices SET
        company_id=COALESCE(?, company_id),
        name=COALESCE(?, name),
        address_line1=COALESCE(?, address_line1),
        address_line2=COALESCE(?, address_line2),
        city=COALESCE(?, city),
        state=COALESCE(?, state),
        country=COALESCE(?, country),
        postcode=COALESCE(?, postcode),
        lat=COALESCE(?, lat),
        lng=COALESCE(?, lng),
        timezone=COALESCE(?, timezone),
        is_active=COALESCE(?, is_active)
       WHERE id=?`,
      [
        b.company_id ?? null, b.name ?? null, b.address_line1 ?? null, b.address_line2 ?? null,
        b.city ?? null, b.state ?? null, b.country ?? null, b.postcode ?? null,
        b.lat ?? null, b.lng ?? null, b.timezone ?? null,
        b.is_active === undefined ? null : (b.is_active ? 1 : 0),
        id
      ]
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
    // hard delete is fine if no FK usage beyond office_ip_whitelists/employees
    await conn.query(`DELETE FROM offices WHERE id=?`, [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};
