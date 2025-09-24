// const { dbPromise } = require('../models/db');

// exports.get = async (req, res) => {
//   const { company_id } = req.query; // optional: support company scope later
//   const conn = await dbPromise.getConnection();
//   try {
//     const [rows] = await conn.query(
//       `SELECT * FROM attendance_ip_policy
//        WHERE (scope='COMPANY' AND company_id = ?) OR scope='GLOBAL'
//        ORDER BY scope='COMPANY' DESC LIMIT 1`,
//       [company_id || null]
//     );
//     res.json({ ok: true, data: rows[0] || null });
//   } catch (e) {
//     res.status(500).json({ ok: false, error: e.message });
//   } finally { conn.release(); }
// };

// exports.update = async (req, res) => {
//   const { mode, trust_proxy, scope = 'GLOBAL', company_id = null } = req.body || {};
//   if (mode && !['FLAG_ONLY', 'ENFORCE'].includes(mode)) {
//     return res.status(400).json({ ok: false, error: 'mode must be FLAG_ONLY or ENFORCE' });
//   }
//   const conn = await dbPromise.getConnection();
//   try {
//     const [rows] = await conn.query(
//       `SELECT id FROM attendance_ip_policy WHERE scope=? AND (company_id<=>?) LIMIT 1`,
//       [scope, company_id]
//     );
//     if (rows.length) {
//       await conn.query(
//         `UPDATE attendance_ip_policy
//          SET mode=COALESCE(?, mode),
//              trust_proxy=COALESCE(?, trust_proxy)
//          WHERE id=?`,
//         [mode || null, (trust_proxy === undefined ? null : (trust_proxy ? 1 : 0)), rows[0].id]
//       );
//       const [[saved]] = await conn.query(`SELECT scope, company_id, mode, trust_proxy FROM attendance_ip_policy WHERE id=?`, [rows[0].id]);
//       return res.json({ ok: true, data: saved });
//     } else {
//       const [r] = await conn.query(
//         `INSERT INTO attendance_ip_policy (scope, company_id, mode, trust_proxy)
//          VALUES (?,?,?,?)`,
//         [scope, company_id, mode || 'FLAG_ONLY', trust_proxy ? 1 : 0]
//       );
//       const [[saved]] = await conn.query(`SELECT scope, company_id, mode, trust_proxy FROM attendance_ip_policy WHERE id=?`, [r.insertId]);
//       return res.json({ ok: true, data: saved });
//     }
//   } catch (e) {
//     return res.status(500).json({ ok: false, error: e.message });
//   } finally {
//     conn.release();
//   }
// };
const { dbPromise } = require('../models/db');

// Order helper
const SCOPE_ORDER = ['EMPLOYEE','COMPANY','GLOBAL'];
const byPrecedence = (a,b) => SCOPE_ORDER.indexOf(a.scope) - SCOPE_ORDER.indexOf(b.scope);
const firstNotNull = (arr, key, fallback=null) => {
  for (const r of arr) if (r[key] !== null && r[key] !== undefined) return r[key];
  return fallback;
};

// GET effective + sources (supports ?employee_id=&company_id=)
exports.get = async (req,res) => {
  const employee_id = req.query.employee_id ? Number(req.query.employee_id) : null;
  const company_id  = req.query.company_id  ? Number(req.query.company_id)  : null;

  const conn = await dbPromise.getConnection();
  try {
    const params = [];
    const where = [];
    if (employee_id) { where.push(`(scope='EMPLOYEE' AND employee_id=?)`); params.push(employee_id); }
    if (company_id)  { where.push(`(scope='COMPANY'  AND company_id=?)`);  params.push(company_id);  }
    where.push(`(scope='GLOBAL')`);

    const [rows] = await conn.query(
      `SELECT id, scope, company_id, employee_id, mode, trust_proxy, allowed_proxy_ips, created_at, updated_at
         FROM attendance_ip_policy
        WHERE ${where.join(' OR ')}
        ORDER BY FIELD(scope,'EMPLOYEE','COMPANY','GLOBAL')`,
      params
    );

    rows.sort(byPrecedence);
    // Effective = highest row for mode; trust_proxy / allowed_proxy_ips fall back
    const effective = {
      scope: rows[0]?.scope || 'GLOBAL',
      mode:  rows[0]?.mode  || 'FLAG_ONLY',
      trust_proxy: firstNotNull(rows, 'trust_proxy', 1) ? 1 : 0,
      allowed_proxy_ips: firstNotNull(rows, 'allowed_proxy_ips', null)
    };

    res.json({ ok:true, data: effective, sources: rows });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  } finally {
    conn.release();
  }
};

// PUT upsert a row for a scope
exports.upsert = async (req,res) => {
  const { scope, company_id=null, employee_id=null, mode, trust_proxy, allowed_proxy_ips } = req.body || {};

  if (!['GLOBAL','COMPANY','EMPLOYEE'].includes(scope)) {
    return res.status(400).json({ ok:false, error:'scope must be GLOBAL, COMPANY or EMPLOYEE' });
  }
  if (!['FLAG_ONLY','ENFORCE'].includes(mode)) {
    return res.status(400).json({ ok:false, error:'mode must be FLAG_ONLY or ENFORCE' });
  }
  if (scope === 'COMPANY' && !company_id) {
    return res.status(400).json({ ok:false, error:'company_id is required for COMPANY scope' });
  }
  if (scope === 'EMPLOYEE' && !employee_id) {
    return res.status(400).json({ ok:false, error:'employee_id is required for EMPLOYEE scope' });
  }

  const conn = await dbPromise.getConnection();
  try {
    const [existing] = await conn.query(
      `SELECT id FROM attendance_ip_policy
        WHERE scope=? AND (company_id <=> ?) AND (employee_id <=> ?) LIMIT 1`,
      [scope, company_id, employee_id]
    );

    if (existing.length) {
      await conn.query(
        `UPDATE attendance_ip_policy
            SET mode=?, trust_proxy=COALESCE(?, trust_proxy), allowed_proxy_ips=?
          WHERE id=?`,
        [mode, (trust_proxy===undefined? null : (trust_proxy?1:0)), allowed_proxy_ips ?? null, existing[0].id]
      );
      const [[row]] = await conn.query(`SELECT * FROM attendance_ip_policy WHERE id=?`, [existing[0].id]);
      return res.json({ ok:true, data: row });
    }

    const [r] = await conn.query(
      `INSERT INTO attendance_ip_policy (scope, company_id, employee_id, mode, trust_proxy, allowed_proxy_ips)
       VALUES (?,?,?,?,?,?)`,
      [scope, company_id, employee_id, mode, (trust_proxy?1:0), allowed_proxy_ips ?? null]
    );
    const [[row]] = await conn.query(`SELECT * FROM attendance_ip_policy WHERE id=?`, [r.insertId]);
    res.json({ ok:true, data: row });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  } finally {
    conn.release();
  }
};

// DELETE EMPLOYEE override (to inherit)
exports.remove = async (req,res) => {
  const scope = (req.query.scope || req.body?.scope || '').toUpperCase();
  const employee_id = Number(req.query.employee_id || req.body?.employee_id);
  if (scope !== 'EMPLOYEE' || !employee_id) {
    return res.status(400).json({ ok:false, error:'scope=EMPLOYEE and employee_id are required' });
  }
  try {
    await dbPromise.query(
      `DELETE FROM attendance_ip_policy WHERE scope='EMPLOYEE' AND employee_id=?`,
      [employee_id]
    );
    res.json({ ok:true });
  } catch (e) {
    res.status(500).json({ ok:false, error:e.message });
  }
};