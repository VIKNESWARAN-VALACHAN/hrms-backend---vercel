// controllers/schedulesController.js
const { dbPromise } = require('../models/db');
const { DateTime } = require('luxon');


function normalizeTimeHHMMSS(t) {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(t).trim());
  if (!m) return null;
  const hh = String(Math.min(23, Math.max(0, Number(m[1])))).padStart(2, '0');
  const mm = String(Math.min(59, Math.max(0, Number(m[2])))).padStart(2, '0');
  const ss = String(Math.min(59, Math.max(0, m[3] ? Number(m[3]) : 0))).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

async function loadEmployeeTZMap(conn, employeeIds) {
  const tzMap = new Map();
  if (!employeeIds.length) return tzMap;
  const defaultTZ = 'Asia/Kuala_Lumpur';
  const ids = [...new Set(employeeIds)].filter(Boolean);
  // Guard empty IN() lists
  const placeholders = ids.map(() => '?').join(',');
  const sql = `SELECT id, COALESCE(time_zone, ?) AS time_zone FROM employees WHERE id IN (${placeholders})`;
  const [rows] = await conn.query(sql, [defaultTZ, ...ids]);
  for (const r of rows) {
    tzMap.set(Number(r.id), r.time_zone || defaultTZ);
  }
  return tzMap;
}

// controllers/schedulesController.js - getByRange function
exports.getByRange = async (req, res) => {
  const { from, to, employee_id, timezone } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to are required' });

  // Use provided timezone or default to Kuala Lumpur
  const targetTimezone = timezone || 'Asia/Kuala_Lumpur';
  
  let ids = [];
  if (employee_id) {
    if (Array.isArray(employee_id)) ids = employee_id.map(Number);
    else if (String(employee_id).includes(',')) ids = String(employee_id).split(',').map(n => parseInt(n, 10));
    else ids = [parseInt(employee_id, 10)];
  }

  try {
    // Convert the returned dates to the specified timezone
    // Use DATE() function to extract just the date part for comparison
    let sql = `
      SELECT 
        id,
        employee_id,
        CONVERT_TZ(schedule_date, '+00:00', ?) as schedule_date,
        time_zone,
        status,
        start_time,
        end_time,
        break_mins,
        overnight,
        template_id,
        pattern_id,
        notes,
        created_by,
        updated_by,
        created_at,
        updated_at
      FROM employee_schedule_days
      WHERE DATE(CONVERT_TZ(schedule_date, '+00:00', ?)) BETWEEN ? AND ?
    `;
    
    const params = [targetTimezone, targetTimezone, from, to];
    
    if (ids.length) {
      sql += ` AND employee_id IN (${ids.map(()=>'?').join(',')})`;
      params.push(...ids);
    }

    // Add ORDER BY to ensure consistent results
    sql += ` ORDER BY employee_id, schedule_date`;

    const [rows] = await dbPromise.query(sql, params);
    
    // Debug log to see what dates are being returned
    console.log(`Fetched ${rows.length} records for range ${from} to ${to}`);
    if (rows.length > 0) {
      const firstDate = rows[0].schedule_date;
      const lastDate = rows[rows.length - 1].schedule_date;
      console.log(`Date range in results: ${firstDate} to ${lastDate}`);
    }
    
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/** POST /api/schedules/bulk
 *  { year, month, items: [{employee_id, day, status, start, end, break_mins, overnight, template_id, notes, pattern_id}] }
 */
exports.bulkUpsert = async (req, res) => {
  const dropped = []; // rows we skip with reasons

  try {
    const { year, month, items } = req.body || {};
    const Y = Number(year);
    const M = Number(month);

    if (
      !Number.isInteger(Y) ||
      !Number.isInteger(M) ||
      M < 1 || M > 12 ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return res.status(400).json({
        error: 'Invalid payload: require integer year, 1..12 month, and non-empty items[]'
      });
    }

    const conn = await dbPromise.getConnection();

    try {
      await conn.beginTransaction();

      // Preload TZs once to avoid N queries
      const employeeIds = items
        .map(it => Number(it?.employee_id))
        .filter(n => Number.isInteger(n) && n > 0);

      const tzMap = await loadEmployeeTZMap(conn, employeeIds);
      const defaultTZ = 'Asia/Kuala_Lumpur';

      // Build a map so we can dedupe rows by (employee_id, localDate)
      // last-write-wins in case multiple entries for same key appear in one batch
      const rowMap = new Map();

      for (let i = 0; i < items.length; i++) {
        const it = items[i] || {};

        const employee_id = Number(it.employee_id);
        const day = Number(it.day);
        if (!Number.isInteger(employee_id) || employee_id <= 0 || !Number.isInteger(day) || day <= 0) {
          dropped.push({ index: i + 1, reason: 'employee_id and day must be positive integers' });
          continue;
        }

        const status = String(it.status || 'off').toLowerCase(); // working|off|leave
        const isWorking = status === 'working';

        const tz = tzMap.get(employee_id) || defaultTZ;

        // Build local date in employee TZ; validate
        const dt = DateTime.fromObject({ year: Y, month: M, day }, { zone: tz });
        if (!dt.isValid) {
          dropped.push({
            index: i + 1,
            reason: `invalid date Y=${Y} M=${M} D=${day} in TZ=${tz}`
          });
          continue;
        }
        const localDate = dt.toISODate(); // 'yyyy-mm-dd'

        // Times
        const start_time = normalizeTimeHHMMSS(it.start);
        const end_time   = normalizeTimeHHMMSS(it.end);

        if (isWorking && (!start_time || !end_time)) {
          dropped.push({
            index: i + 1,
            reason: `missing/invalid time for working day (emp ${employee_id}, ${localDate})`
          });
          continue;
        }

        const break_mins = isWorking ? Number(it.break_mins ?? 0) : 0;
        const overnight  = isWorking ? (it.overnight ? 1 : 0) : 0;
        const template_id = isWorking ? (it.template_id || null) : null;
        const pattern_id  = it.pattern_id || null;
        const notes       = it.notes || null;

        // If DB has NOT NULL on created_by/updated_by, set a safe fallback
        const created_by = req.user?.id ?? null; // change to 0 if your schema requires NOT NULL
        const updated_by = req.user?.id ?? null; // change to 0 if your schema requires NOT NULL

        // If your DB has NOT NULL on start_time/end_time, swap nulls for '00:00:00' instead.
        const startCol = isWorking ? start_time : null;
        const endCol   = isWorking ? end_time   : null;

        // Dedupe key
        const key = `${employee_id}|${localDate}`;

        // Last-write-wins
        rowMap.set(key, [
          employee_id,
          localDate,
          tz,
          status,
          startCol,
          endCol,
          break_mins,
          overnight,
          template_id,
          pattern_id,
          notes,
          created_by,
          updated_by
        ]);
      }

      const rows = Array.from(rowMap.values());

      if (rows.length === 0) {
        // Nothing valid to write
        return res.status(400).json({
          error: 'No valid rows to upsert.',
          dropped
        });
      }

      const sql = `
        INSERT INTO employee_schedule_days
          (employee_id, schedule_date, time_zone, status, start_time, end_time, break_mins, overnight, template_id, pattern_id, notes, created_by, updated_by)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          time_zone = VALUES(time_zone),
          status    = VALUES(status),
          start_time= VALUES(start_time),
          end_time  = VALUES(end_time),
          break_mins= VALUES(break_mins),
          overnight = VALUES(overnight),
          template_id=VALUES(template_id),
          pattern_id =VALUES(pattern_id),
          notes      =VALUES(notes),
          updated_by =VALUES(updated_by)
      `;

      await conn.query(sql, [rows]);

      await conn.commit();
      return res.json({
        ok: true,
        count: rows.length,
        dropped_count: dropped.length,
        dropped // keep for client-side debugging; remove in prod if noisy
      });
    } catch (e) {
      await conn.rollback();
      // Prefer 400 for known user/data errors; default to 500 otherwise
      const status = Number.isInteger(e?.http) ? e.http : 500;
      return res.status(status).json({ error: e.sqlMessage || e.message || 'Internal error' });
    } finally {
      conn.release();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Internal error' });
  }
};

/* ===== Templates ===== */

exports.listTemplates = async (_req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM schedule_templates ORDER BY id');
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.createTemplate = async (req, res) => {
  const { name, start_time, end_time, break_mins = 0, overnight = 0, label, description } = req.body;
  if (!name || !start_time || !end_time) {
    return res.status(400).json({ error: 'name, start_time, end_time required' });
  }
  try {
    const [r] = await dbPromise.query(
      `INSERT INTO schedule_templates(name, start_time, end_time, break_mins, overnight, label, description)
       VALUES (?,?,?,?,?,?,?)`,
      [name, start_time, end_time, Number(break_mins)||0, overnight ? 1 : 0, label || null, description || null]
    );
    res.json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.updateTemplate = async (req, res) => {
  const id = Number(req.params.id);
  const { name, start_time, end_time, break_mins, overnight, label, description } = req.body;
  try {
    await dbPromise.query(
      `UPDATE schedule_templates
       SET name=?, start_time=?, end_time=?, break_mins=?, overnight=?, label=?, description=?, updated_at=NOW()
       WHERE id=?`,
      [name, start_time, end_time, Number(break_mins)||0, overnight?1:0, label||null, description||null, id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

exports.deleteTemplate = async (req, res) => {
  const id = Number(req.params.id);
  try {
    await dbPromise.query('DELETE FROM schedule_templates WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

/* ===== Patterns ===== */

exports.listPatterns = async (_req, res) => {
  // Use a single connection (optional but consistent)
  const conn = await dbPromise.getConnection();
  try {
    const [headers] = await conn.query('SELECT * FROM schedule_patterns ORDER BY id');
    const [steps]   = await conn.query('SELECT * FROM schedule_pattern_steps ORDER BY pattern_id, step_order');

    const map = {};
    for (const h of headers) map[h.id] = { ...h, sequence: [] };
    for (const s of steps) {
      if (map[s.pattern_id]) map[s.pattern_id].sequence.push({
        type: s.step_type,
        template: s.template_id
      });
    }
    res.json(Object.values(map));
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

exports.createPattern = async (req, res) => {
  const { name, description, sequence } = req.body;
  if (!name || !Array.isArray(sequence) || sequence.length === 0) {
    return res.status(400).json({ error: 'name and non-empty sequence required' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const [r] = await conn.query(
      'INSERT INTO schedule_patterns(name, description) VALUES (?,?)',
      [name, description || null]
    );
    const pid = r.insertId;

    const values = sequence.map((step, idx) => [
      pid, idx + 1, step.type, step.type === 'work' ? step.template : null
    ]);

    await conn.query(
      `INSERT INTO schedule_pattern_steps(pattern_id, step_order, step_type, template_id)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.json({ id: pid });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

exports.updatePattern = async (req, res) => {
  const id = Number(req.params.id);
  const { name, description, sequence } = req.body;

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      'UPDATE schedule_patterns SET name=?, description=?, updated_at=NOW() WHERE id=?',
      [name, description || null, id]
    );

    await conn.query('DELETE FROM schedule_pattern_steps WHERE pattern_id=?', [id]);

    if (Array.isArray(sequence) && sequence.length) {
      const values = sequence.map((step, idx) => [
        id, idx + 1, step.type, step.type === 'work' ? step.template : null
      ]);
      await conn.query(
        `INSERT INTO schedule_pattern_steps(pattern_id, step_order, step_type, template_id)
         VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    await conn.rollback();
    res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
};

exports.deletePattern = async (req, res) => {
  const id = Number(req.params.id);
  try {
    await dbPromise.query('DELETE FROM schedule_patterns WHERE id=?', [id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
