const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');


function normalizeEventType(raw) {
  const v = String(raw || '').toLowerCase().trim();
  if (v === 'event') return 'event';
  return 'holiday'; 
}


function parseIntOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function getCompanyIdsForEmployee(conn, employeeId) {
  const companyIds = new Set();

  // Try many-to-many mapping table first (if exists)
  try {
    const [rowsMap] = await conn.query(
      `SELECT company_id FROM employee_companies WHERE employee_id = ?`,
      [employeeId]
    );
    for (const r of rowsMap) {
      if (r.company_id != null) companyIds.add(Number(r.company_id));
    }
  } catch (e) {
    // table might not exist; ignore
  }

  // Fallback: single company on employees table
  try {
    const [rowsEmp] = await conn.query(
      `SELECT company_id FROM employees WHERE id = ?`,
      [employeeId]
    );
    for (const r of rowsEmp) {
      if (r.company_id != null) companyIds.add(Number(r.company_id));
    }
  } catch (e) {
    // table/column might not exist; ignore
  }

  return Array.from(companyIds);
}

exports.getAllHolidays1 = async (req, res) => {
  const employeeId   = parseIntOrNull(req.query.employee_id);
  const companyId    = parseIntOrNull(req.query.company_id); // still supported
  const includeGlobal = req.query.include_global !== '0';     // default true
  const year         = parseIntOrNull(req.query.year);
  const month        = parseIntOrNull(req.query.month);

  // helpers for efficient date ranges
  const pad2 = (n) => String(n).padStart(2, '0');
  const monthStart = (y, m) => `${y}-${pad2(m)}-01`;
  const nextMonthStart = (y, m) => {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return `${ny}-${pad2(nm)}-01`;
  };

  const conn = await dbPromise.getConnection();
  try {
    // Resolve employee’s company IDs if provided
    let employeeCompanyIds = [];
    if (employeeId) {
      employeeCompanyIds = await getCompanyIdsForEmployee(conn, employeeId);
    }

    const where = [];
    const params = [];

    // Date range (index-friendly)
    if (year && month) {
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(monthStart(year, month), nextMonthStart(year, month));
    } else if (year) {
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(`${year}-01-01`, `${year + 1}-01-01`);
    } else if (month) {
      const now = new Date();
      const y = now.getFullYear();
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(monthStart(y, month), nextMonthStart(y, month));
    }

    // Company/global filter precedence:
    // 1) If employee_id present -> use employeeCompanyIds
    if (employeeId) {
      if (employeeCompanyIds.length) {
        if (includeGlobal) {
          where.push('(ph.is_global = 1 OR pc.company_id IN (?))');
          params.push(employeeCompanyIds);
        } else {
          where.push('(ph.is_global = 0 AND pc.company_id IN (?))');
          params.push(employeeCompanyIds);
        }
      } else {
        // Employee has no company; only globals if requested
        if (includeGlobal) {
          where.push('ph.is_global = 1');
        } else {
          // nothing would match; short-circuit with an impossible condition
          where.push('1 = 0');
        }
      }
    }
    // 2) Else if explicit company_id is passed (old behavior)
    else if (companyId) {
      if (includeGlobal) {
        where.push('(ph.is_global = 1 OR pc.company_id = ?)');
        params.push(companyId);
      } else {
        where.push('(ph.is_global = 0 AND pc.company_id = ?)');
        params.push(companyId);
      }
    }
    // 3) Else (no employee/company filter)
    else {
      if (!includeGlobal) {
        where.push('ph.is_global = 0');
      }
      // else: show all (global + local)
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT
        ph.id,
        DATE_FORMAT(ph.holiday_date, '%Y-%m-%d') AS holiday_date,  -- date-only ✅
        ph.title,
        ph.description,
        ph.location_id,
        ph.is_global,
        ph.created_at,
        GROUP_CONCAT(DISTINCT pc.company_id ORDER BY pc.company_id SEPARATOR ',') AS company_ids_csv,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS company_names
      FROM public_holidays ph
      LEFT JOIN public_holiday_companies pc ON pc.holiday_id = ph.id
      LEFT JOIN companies c ON c.id = pc.company_id
      ${whereSql}
      GROUP BY ph.id
      ORDER BY ph.holiday_date ASC, ph.id ASC
    `;

    const [rows] = await conn.query(sql, params);

    const result = rows.map((r) => ({
      id: r.id,
      holiday_date: r.holiday_date,          // 'YYYY-MM-DD'
      title: r.title,
      description: r.description,
      location_id: r.location_id,
      is_global: !!r.is_global,
      created_at: r.created_at,
      company_ids: r.company_ids_csv
        ? r.company_ids_csv.split(',').map((s) => Number(s)).filter(Number.isFinite)
        : [],
      company_names: r.company_names || '',
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching holidays:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  } finally {
    conn.release();
  }
};

exports.getAllHolidays = async (req, res) => {
  const employeeId    = parseIntOrNull(req.query.employee_id);
  const companyId     = parseIntOrNull(req.query.company_id);
  const includeGlobal = req.query.include_global !== '0';
  const year          = parseIntOrNull(req.query.year);
  const month         = parseIntOrNull(req.query.month);
  const eventTypeQ    = req.query.event_type ? normalizeEventType(req.query.event_type) : null;

  const pad2 = (n) => String(n).padStart(2, '0');
  const monthStart = (y, m) => `${y}-${pad2(m)}-01`;
  const nextMonthStart = (y, m) => {
    const nm = m === 12 ? 1 : m + 1;
    const ny = m === 12 ? y + 1 : y;
    return `${ny}-${pad2(nm)}-01`;
  };

  const conn = await dbPromise.getConnection();
  try {
    let employeeCompanyIds = [];
    if (employeeId) {
      employeeCompanyIds = await getCompanyIdsForEmployee(conn, employeeId);
    }

    const where = [];
    const params = [];

    if (year && month) {
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(monthStart(year, month), nextMonthStart(year, month));
    } else if (year) {
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(`${year}-01-01`, `${year + 1}-01-01`);
    } else if (month) {
      const now = new Date();
      const y = now.getFullYear();
      where.push('ph.holiday_date >= ? AND ph.holiday_date < ?');
      params.push(monthStart(y, month), nextMonthStart(y, month));
    }

    // NEW: event_type filter (optional)
    if (eventTypeQ) {
      where.push('ph.event_type = ?');
      params.push(eventTypeQ);
    }

    if (employeeId) {
      if (employeeCompanyIds.length) {
        if (includeGlobal) {
          where.push('(ph.is_global = 1 OR pc.company_id IN (?))');
          params.push(employeeCompanyIds);
        } else {
          where.push('(ph.is_global = 0 AND pc.company_id IN (?))');
          params.push(employeeCompanyIds);
        }
      } else {
        if (includeGlobal) {
          where.push('ph.is_global = 1');
        } else {
          where.push('1 = 0');
        }
      }
    } else if (companyId) {
      if (includeGlobal) {
        where.push('(ph.is_global = 1 OR pc.company_id = ?)');
        params.push(companyId);
      } else {
        where.push('(ph.is_global = 0 AND pc.company_id = ?)');
        params.push(companyId);
      }
    } else {
      if (!includeGlobal) {
        where.push('ph.is_global = 0');
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const sql = `
      SELECT
        ph.id,
        DATE_FORMAT(ph.holiday_date, '%Y-%m-%d') AS holiday_date,
        ph.title,
        ph.description,
        ph.location_id,
        ph.is_global,
        ph.event_type,  -- NEW
        ph.created_at,
        GROUP_CONCAT(DISTINCT pc.company_id ORDER BY pc.company_id SEPARATOR ',') AS company_ids_csv,
        GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS company_names
      FROM public_holidays ph
      LEFT JOIN public_holiday_companies pc ON pc.holiday_id = ph.id
      LEFT JOIN companies c ON c.id = pc.company_id
      ${whereSql}
      GROUP BY ph.id
      ORDER BY ph.holiday_date ASC, ph.id ASC
    `;

    const [rows] = await conn.query(sql, params);

    const result = rows.map((r) => ({
      id: r.id,
      holiday_date: r.holiday_date,
      title: r.title,
      description: r.description,
      location_id: r.location_id,
      is_global: !!r.is_global,
      event_type: r.event_type || 'holiday', // NEW
      created_at: r.created_at,
      company_ids: r.company_ids_csv
        ? r.company_ids_csv.split(',').map((s) => Number(s)).filter(Number.isFinite)
        : [],
      company_names: r.company_names || '',
    }));

    res.json(result);
  } catch (err) {
    console.error('Error fetching holidays:', err);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  } finally {
    conn.release();
  }
};


exports.createHoliday1 = async (req, res) => {
  const { holiday_date, title, description, is_global, company_ids } = req.body;

  if (!holiday_date || !title?.trim()) {
    return res.status(400).json({ error: 'holiday_date and title are required' });
  }
  if (!is_global && (!Array.isArray(company_ids) || company_ids.length === 0)) {
    return res.status(400).json({ error: 'company_ids required when is_global is false' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO public_holidays (holiday_date, title, description, location_id, is_global)
       VALUES (?, ?, ?, NULL, ?)`,
      [holiday_date, title.trim(), description || '', is_global ? 1 : 0]
    );

    const holidayId = result.insertId;

    if (!is_global && company_ids?.length) {
      const values = company_ids.map(cid => [holidayId, cid]);
      await conn.query(
        `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ id: holidayId });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating holiday:', err);
    res.status(500).json({ error: 'Failed to create holiday' });
  } finally {
    conn.release();
  }
};

exports.createHoliday = async (req, res) => {
  const { holiday_date, title, description, is_global, company_ids } = req.body;
  const event_type = normalizeEventType(req.body.event_type);

  if (!holiday_date || !title?.trim()) {
    return res.status(400).json({ error: 'holiday_date and title are required' });
  }
  if (!is_global && (!Array.isArray(company_ids) || company_ids.length === 0)) {
    return res.status(400).json({ error: 'company_ids required when is_global is false' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO public_holidays (holiday_date, title, description, location_id, is_global, event_type)
       VALUES (?, ?, ?, NULL, ?, ?)`,
      [holiday_date, title.trim(), description || '', is_global ? 1 : 0, event_type]
    );

    const holidayId = result.insertId;

    if (!is_global && company_ids?.length) {
      const values = company_ids.map(cid => [holidayId, cid]);
      await conn.query(
        `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ id: holidayId });
  } catch (err) {
    await conn.rollback();
    console.error('Error creating holiday:', err);
    res.status(500).json({ error: 'Failed to create holiday' });
  } finally {
    conn.release();
  }
};

// Delete holiday
exports.deleteHoliday = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM public_holidays WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting holiday:', err);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
};

exports.updateHoliday1 = async (req, res) => {
  const id = Number(req.params.id);
  const { holiday_date, title, description, is_global, company_ids } = req.body;

  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!holiday_date || !title?.trim()) {
    return res.status(400).json({ error: 'holiday_date and title are required' });
  }
  if (!is_global && (!Array.isArray(company_ids) || company_ids.length === 0)) {
    return res.status(400).json({ error: 'company_ids required when is_global is false' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE public_holidays
         SET holiday_date = ?, title = ?, description = ?, is_global = ?
       WHERE id = ?`,
      [holiday_date, title.trim(), description || '', is_global ? 1 : 0, id]
    );

    // reset mappings
    await conn.query(`DELETE FROM public_holiday_companies WHERE holiday_id = ?`, [id]);

    if (!is_global && company_ids?.length) {
      const values = company_ids.map(cid => [id, cid]);
      await conn.query(
        `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Error updating holiday:', err);
    res.status(500).json({ error: 'Failed to update holiday' });
  } finally {
    conn.release();
  }
};

exports.updateHoliday = async (req, res) => {
  const id = Number(req.params.id);
  const { holiday_date, title, description, is_global, company_ids } = req.body;
  const event_type = normalizeEventType(req.body.event_type);

  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });
  if (!holiday_date || !title?.trim()) {
    return res.status(400).json({ error: 'holiday_date and title are required' });
  }
  if (!is_global && (!Array.isArray(company_ids) || company_ids.length === 0)) {
    return res.status(400).json({ error: 'company_ids required when is_global is false' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE public_holidays
         SET holiday_date = ?, title = ?, description = ?, is_global = ?, event_type = ?
       WHERE id = ?`,
      [holiday_date, title.trim(), description || '', is_global ? 1 : 0, event_type, id]
    );

    await conn.query(`DELETE FROM public_holiday_companies WHERE holiday_id = ?`, [id]);

    if (!is_global && company_ids?.length) {
      const values = company_ids.map(cid => [id, cid]);
      await conn.query(
        `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
        [values]
      );
    }

    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Error updating holiday:', err);
    res.status(500).json({ error: 'Failed to update holiday' });
  } finally {
    conn.release();
  }
};


exports.exportHolidays1 = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ph.holiday_date, ph.title, ph.description, ph.is_global,
             GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS company_names
      FROM public_holidays ph
      LEFT JOIN public_holiday_companies pc ON pc.holiday_id = ph.id
      LEFT JOIN companies c ON c.id = pc.company_id
      GROUP BY ph.id
      ORDER BY ph.holiday_date ASC
    `);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Holidays');

    sheet.columns = [
      { header: 'Holiday Date', key: 'holiday_date', width: 14 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Is Global', key: 'is_global', width: 10 },
      { header: 'Company Names', key: 'company_names', width: 40 },
    ];

    sheet.addRows(rows.map(r => ({
      ...r,
      is_global: r.is_global ? 'Yes' : 'No',
    })));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=holidays.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting holidays:', err);
    res.status(500).json({ error: 'Failed to export holidays' });
  }
};

exports.exportHolidays = async (_req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ph.holiday_date, ph.title, ph.description, ph.is_global, ph.event_type,
             GROUP_CONCAT(DISTINCT c.name ORDER BY c.name SEPARATOR ', ') AS company_names
      FROM public_holidays ph
      LEFT JOIN public_holiday_companies pc ON pc.holiday_id = ph.id
      LEFT JOIN companies c ON c.id = pc.company_id
      GROUP BY ph.id
      ORDER BY ph.holiday_date ASC
    `);

    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Holidays');

    sheet.columns = [
      { header: 'Holiday Date', key: 'holiday_date', width: 14 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Is Global', key: 'is_global', width: 10 },
      { header: 'Event Type', key: 'event_type', width: 12 },       // NEW
      { header: 'Company Names', key: 'company_names', width: 40 },
    ];

    sheet.addRows(rows.map(r => ({
      ...r,
      is_global: r.is_global ? 'Yes' : 'No',
      event_type: r.event_type || 'holiday',
    })));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=holidays.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting holidays:', err);
    res.status(500).json({ error: 'Failed to export holidays' });
  }
};


exports.importHolidays1 = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.files.file.data);
    const ws = workbook.getWorksheet(1);

    // ----- headers -----
    const headerRow = ws.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, col) => {
      headerMap[String(cell.value).trim().toLowerCase()] = col;
    });

    const idxDate      = headerMap['holiday date'];
    const idxTitle     = headerMap['title'];
    const idxDesc      = headerMap['description'];
    const idxCompanies = headerMap['company names']; // CSV of names
    const idxIsGlobal  = headerMap['is global'];

    if (!idxDate || !idxTitle) {
      return res.status(400).json({ error: 'Missing required headers: Holiday Date, Title' });
    }

    // ----- helpers -----
    const toYMD = (v) => {
      if (!v) return null;

      // ExcelJS may return: Date, number (Excel serial), string, or rich object
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (typeof v === 'number') {
        // Excel serial (1900 date system)
        const ms = Math.round((v - 25569) * 86400 * 1000);
        const dt = new Date(ms);
        // use UTC parts to avoid TZ shifts
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (typeof v === 'string') {
        // accept 'YYYY-MM-DD' or ISO; trim to 10 chars if longer
        return v.slice(0, 10);
      }
      // ExcelJS rich text or formula result as object
      if (v && typeof v === 'object' && 'text' in v && typeof v.text === 'string') {
        return v.text.slice(0, 10);
      }
      return null;
    };

    const parseIsGlobal = (raw) => {
      if (raw == null) return 1; // default true
      const val = String(raw).trim().toLowerCase();
      if (['0', 'false', 'no', 'n'].includes(val)) return 0;
      return 1;
    };

    // ----- gather rows from Excel -----
    // Dedupe within the file by (date, title) — last occurrence wins (merges companies)
    const byKey = new Map(); // key: `${date}||${titleLower}`
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);

      const rawDate = row.getCell(idxDate).value;
      const dateYMD = toYMD(rawDate);
      const title   = String(row.getCell(idxTitle).value || '').trim();
      if (!dateYMD || !title) continue;

      const description = String(row.getCell(idxDesc)?.value || '').trim();

      const companiesText = idxCompanies ? String(row.getCell(idxCompanies)?.value || '') : '';
      const names = companiesText
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const is_global = parseIsGlobal(idxIsGlobal ? row.getCell(idxIsGlobal).value : null);

      const key = `${dateYMD}||${title.toLowerCase()}`;
      const prev = byKey.get(key);
      if (prev) {
        // merge: prefer latest non-empty description, OR the previous if empty
        prev.description = description || prev.description || '';
        prev.is_global   = is_global; // last wins
        // merge companies
        prev.companyNames = Array.from(new Set([...prev.companyNames, ...names]));
      } else {
        byKey.set(key, {
          holiday_date: dateYMD,
          title,
          description,
          is_global,
          companyNames: names,
        });
      }
    }

    // nothing to do?
    if (byKey.size === 0) {
      return res.json({ message: 'No valid rows to import.', created: 0, updated: 0, skipped_unknown_companies: 0 });
    }

    const conn = await dbPromise.getConnection();
    try {
      await conn.beginTransaction();

      // Cache companies by name
      const [companies] = await conn.query(`SELECT id, name FROM companies WHERE COALESCE(is_delete,0)=0`);
      const companyNameToId = new Map(companies.map(c => [String(c.name).toLowerCase(), Number(c.id)]));

      // Load existing holidays for all involved dates to minimize round-trips
      const datesInFile = Array.from(new Set(Array.from(byKey.values()).map(v => v.holiday_date)));
      const [existingRows] = await conn.query(
        `SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, title, description, is_global
         FROM public_holidays
         WHERE holiday_date IN (?)`,
        [datesInFile]
      );

      // And their company links
      const existingIds = existingRows.map(r => r.id);
      let existingLinks = [];
      if (existingIds.length) {
        const [rowsLinks] = await conn.query(
          `SELECT holiday_id, company_id FROM public_holiday_companies WHERE holiday_id IN (?)`,
          [existingIds]
        );
        existingLinks = rowsLinks;
      }

      // Build lookup maps
      const existingByKey = new Map(); // `${ymd}||${titleLower}` -> row
      for (const r of existingRows) {
        const k = `${r.holiday_date}||${String(r.title).toLowerCase()}`;
        existingByKey.set(k, r);
      }
      const linksByHoliday = new Map(); // holiday_id -> Set(company_id)
      for (const link of existingLinks) {
        if (!linksByHoliday.has(link.holiday_id)) linksByHoliday.set(link.holiday_id, new Set());
        linksByHoliday.get(link.holiday_id).add(link.company_id);
      }

      let created = 0;
      let updated = 0;
      let skippedUnknownCompanies = 0;

      for (const [key, item] of byKey.entries()) {
        const { holiday_date, title, description, is_global, companyNames } = item;
        const match = existingByKey.get(`${holiday_date}||${title.toLowerCase()}`);

        // Resolve Excel company names -> ids (ignore unknown names)
        const desiredCompanyIds = [];
        for (const nm of companyNames) {
          const cid = companyNameToId.get(nm.toLowerCase());
          if (cid) desiredCompanyIds.push(cid); else skippedUnknownCompanies++;
        }
        const desiredSet = new Set(desiredCompanyIds);

        if (match) {
          // UPDATE path
          const needUpdate =
            String(match.description || '') !== String(description || '') ||
            Number(match.is_global) !== Number(is_global);

          if (needUpdate) {
            await conn.query(
              `UPDATE public_holidays SET description = ?, is_global = ? WHERE id = ?`,
              [description || '', is_global, match.id]
            );
            updated++;
          }

          // Sync company links
          if (Number(is_global) === 1) {
            // global: remove all links
            await conn.query(`DELETE FROM public_holiday_companies WHERE holiday_id = ?`, [match.id]);
          } else {
            // local: add missing, remove extras
            const currentSet = linksByHoliday.get(match.id) || new Set();

            const toAdd = [];
            desiredSet.forEach(cid => { if (!currentSet.has(cid)) toAdd.push([match.id, cid]); });
            if (toAdd.length) {
              await conn.query(
                `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
                [toAdd]
              );
            }

            const toRemove = [];
            currentSet.forEach(cid => { if (!desiredSet.has(cid)) toRemove.push(cid); });
            if (toRemove.length) {
              await conn.query(
                `DELETE FROM public_holiday_companies WHERE holiday_id = ? AND company_id IN (?)`,
                [match.id, toRemove]
              );
            }
          }
        } else {
          // INSERT path (no holiday with the same (date,title))
          const [ins] = await conn.query(
            `INSERT INTO public_holidays (holiday_date, title, description, location_id, is_global)
             VALUES (?, ?, ?, NULL, ?)`,
            [holiday_date, title, description || '', is_global]
          );
          created++;

          if (Number(is_global) === 0 && desiredCompanyIds.length) {
            const vals = desiredCompanyIds.map(cid => [ins.insertId, cid]);
            await conn.query(
              `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
              [vals]
            );
          }
        }
      }

      await conn.commit();
      return res.json({
        message: `Import done. Created: ${created}, Updated: ${updated}.`,
        created,
        updated,
        skipped_unknown_companies: skippedUnknownCompanies
      });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      if (conn) conn.release();
    }
  } catch (err) {
    console.error('Error importing holidays:', err);
    res.status(500).json({ error: 'Failed to import holidays', details: err.message });
  }
};

exports.importHolidays = async (req, res) => {
  try {
    if (!req.files || !req.files.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.files.file.data);
    const ws = workbook.getWorksheet(1);

    const headerRow = ws.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, col) => {
      headerMap[String(cell.value).trim().toLowerCase()] = col;
    });

    const idxDate      = headerMap['holiday date'];
    const idxTitle     = headerMap['title'];
    const idxDesc      = headerMap['description'];
    const idxCompanies = headerMap['company names'];
    const idxIsGlobal  = headerMap['is global'];
    const idxType      = headerMap['event type']; // NEW (optional)

    if (!idxDate || !idxTitle) {
      return res.status(400).json({ error: 'Missing required headers: Holiday Date, Title' });
    }

    const toYMD = (v) => {
      if (!v) return null;
      if (v instanceof Date) {
        const y = v.getFullYear();
        const m = String(v.getMonth() + 1).padStart(2, '0');
        const d = String(v.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (typeof v === 'number') {
        const ms = Math.round((v - 25569) * 86400 * 1000);
        const dt = new Date(ms);
        const y = dt.getUTCFullYear();
        const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
        const d = String(dt.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
      if (typeof v === 'string') return v.slice(0, 10);
      if (v && typeof v === 'object' && 'text' in v && typeof v.text === 'string') {
        return v.text.slice(0, 10);
      }
      return null;
    };

    const parseIsGlobal = (raw) => {
      if (raw == null) return 1;
      const val = String(raw).trim().toLowerCase();
      if (['0', 'false', 'no', 'n'].includes(val)) return 0;
      return 1;
    };

    const byKey = new Map(); // key: `${date}||${titleLower}||${event_type}`
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);

      const rawDate = row.getCell(idxDate).value;
      const dateYMD = toYMD(rawDate);
      const title   = String(row.getCell(idxTitle).value || '').trim();
      if (!dateYMD || !title) continue;

      const description = String(row.getCell(idxDesc)?.value || '').trim();
      const companiesText = idxCompanies ? String(row.getCell(idxCompanies)?.value || '') : '';
      const names = companiesText.split(',').map(s => s.trim()).filter(Boolean);
      const is_global = parseIsGlobal(idxIsGlobal ? row.getCell(idxIsGlobal).value : null);

      // NEW: parse event_type
      const rawType = idxType ? row.getCell(idxType).value : null;
      const event_type = normalizeEventType(rawType);

      const key = `${dateYMD}||${title.toLowerCase()}||${event_type}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.description = description || prev.description || '';
        prev.is_global   = is_global;
        prev.companyNames = Array.from(new Set([...prev.companyNames, ...names]));
      } else {
        byKey.set(key, {
          holiday_date: dateYMD,
          title,
          description,
          is_global,
          event_type,     // NEW
          companyNames: names,
        });
      }
    }

    if (byKey.size === 0) {
      return res.json({ message: 'No valid rows to import.', created: 0, updated: 0, skipped_unknown_companies: 0 });
    }

    const conn = await dbPromise.getConnection();
    try {
      await conn.beginTransaction();

      const [companies] = await conn.query(`SELECT id, name FROM companies WHERE COALESCE(is_delete,0)=0`);
      const companyNameToId = new Map(companies.map(c => [String(c.name).toLowerCase(), Number(c.id)]));

      const datesInFile = Array.from(new Set(Array.from(byKey.values()).map(v => v.holiday_date)));
      const [existingRows] = await conn.query(
        `SELECT id, DATE_FORMAT(holiday_date, '%Y-%m-%d') AS holiday_date, title, description, is_global, event_type
         FROM public_holidays
         WHERE holiday_date IN (?)`,
        [datesInFile]
      );

      const existingIds = existingRows.map(r => r.id);
      let existingLinks = [];
      if (existingIds.length) {
        const [rowsLinks] = await conn.query(
          `SELECT holiday_id, company_id FROM public_holiday_companies WHERE holiday_id IN (?)`,
          [existingIds]
        );
        existingLinks = rowsLinks;
      }

      const existingByKey = new Map(); // `${ymd}||${titleLower}||${event_type}`
      for (const r of existingRows) {
        const k = `${r.holiday_date}||${String(r.title).toLowerCase()}||${normalizeEventType(r.event_type)}`;
        existingByKey.set(k, r);
      }
      const linksByHoliday = new Map();
      for (const link of existingLinks) {
        if (!linksByHoliday.has(link.holiday_id)) linksByHoliday.set(link.holiday_id, new Set());
        linksByHoliday.get(link.holiday_id).add(link.company_id);
      }

      let created = 0;
      let updated = 0;
      let skippedUnknownCompanies = 0;

      for (const [, item] of byKey.entries()) {
        const { holiday_date, title, description, is_global, event_type, companyNames } = item;
        const match = existingByKey.get(`${holiday_date}||${title.toLowerCase()}||${event_type}`);

        const desiredCompanyIds = [];
        for (const nm of companyNames) {
          const cid = companyNameToId.get(nm.toLowerCase());
          if (cid) desiredCompanyIds.push(cid); else skippedUnknownCompanies++;
        }
        const desiredSet = new Set(desiredCompanyIds);

        if (match) {
          const needUpdate =
            String(match.description || '') !== String(description || '') ||
            Number(match.is_global) !== Number(is_global) ||
            normalizeEventType(match.event_type) !== event_type;

          if (needUpdate) {
            await conn.query(
              `UPDATE public_holidays SET description = ?, is_global = ?, event_type = ? WHERE id = ?`,
              [description || '', is_global, event_type, match.id]
            );
            updated++;
          }

          if (Number(is_global) === 1) {
            await conn.query(`DELETE FROM public_holiday_companies WHERE holiday_id = ?`, [match.id]);
          } else {
            const currentSet = linksByHoliday.get(match.id) || new Set();

            const toAdd = [];
            desiredSet.forEach(cid => { if (!currentSet.has(cid)) toAdd.push([match.id, cid]); });
            if (toAdd.length) {
              await conn.query(
                `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
                [toAdd]
              );
            }

            const toRemove = [];
            currentSet.forEach(cid => { if (!desiredSet.has(cid)) toRemove.push(cid); });
            if (toRemove.length) {
              await conn.query(
                `DELETE FROM public_holiday_companies WHERE holiday_id = ? AND company_id IN (?)`,
                [match.id, toRemove]
              );
            }
          }
        } else {
          const [ins] = await conn.query(
            `INSERT INTO public_holidays (holiday_date, title, description, location_id, is_global, event_type)
             VALUES (?, ?, ?, NULL, ?, ?)`,
            [holiday_date, title, description || '', is_global, event_type]
          );
          created++;

          if (Number(is_global) === 0 && desiredCompanyIds.length) {
            const vals = desiredCompanyIds.map(cid => [ins.insertId, cid]);
            await conn.query(
              `INSERT INTO public_holiday_companies (holiday_id, company_id) VALUES ?`,
              [vals]
            );
          }
        }
      }

      await conn.commit();
      return res.json({
        message: `Import done. Created: ${created}, Updated: ${updated}.`,
        created,
        updated,
        skipped_unknown_companies: skippedUnknownCompanies
      });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally {
      // eslint-disable-next-line no-unsafe-finally
      conn && conn.release();
    }
  } catch (err) {
    console.error('Error importing holidays:', err);
    res.status(500).json({ error: 'Failed to import holidays', details: err.message });
  }
};


/** For dropdowns in UI */
exports.listCompaniesForHolidays = async (_req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT id, name
         FROM companies
        WHERE COALESCE(is_delete,0)=0 AND COALESCE(is_active,1)=1
        ORDER BY name ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching companies:', err);
    res.status(500).json({ error: 'Failed to fetch companies' });
  }
};
