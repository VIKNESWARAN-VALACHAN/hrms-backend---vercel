const { dbPromise } = require('../models/db');

exports.assignOffice = async (req, res) => {
  const { id } = req.params;               // employee id
  const { office_id } = req.body;
  if (!office_id) return res.status(400).json({ ok: false, error: 'office_id is required' });

  const conn = await dbPromise.getConnection();
  try {
    // Optional: verify office exists and is active
    const [[office]] = await conn.query(`SELECT id FROM offices WHERE id=? AND is_active=1`, [office_id]);
    if (!office) return res.status(404).json({ ok: false, error: 'Office not found or inactive' });

    await conn.query(`UPDATE employees SET office_id=? WHERE id=?`, [office_id, id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  } finally { conn.release(); }
};
