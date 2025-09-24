// controllers/bankCurrencyController.js
const { dbPromise } = require('../models/db');


function normalizeBankCode(input) {
  if (!input) return null;
  return String(input).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// ========== BANKS ==========
exports.getBanks = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM banks ORDER BY id DESC`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch banks.' });
  }
};

exports.addBank2 = async (req, res) => {
  const { name, currency_code = 'MYR', type, status } = req.body;
  try {
    await dbPromise.query(
      `INSERT INTO banks (bank_name, currency_code, type, status) VALUES (?, ?, ?, ?)`,
      [name, currency_code, type, status]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('DB Error:', err); // optional: logs actual error
    res.status(500).json({ error: 'Failed to add bank.' });
  }
};


exports.updateBank2 = async (req, res) => {
  const { id } = req.params;
  const { name, currency_code, type, status } = req.body;
  try {
    await dbPromise.query(`UPDATE banks SET bank_name=?, currency_code=?, type=?, status=? WHERE id=?`,
      [name, currency_code, type, status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update bank.' });
  }
};

exports.addBank = async (req, res) => {
  try {
    const {
      name,
      bank_code,                       // NEW
      currency_code = 'MYR',
      type = 'Bank',
      status = 'Active',
    } = req.body || {};

    if (!name) return res.status(400).json({ error: 'Bank name is required.' });

    // Backward compatibility: derive a code if not provided
    const derivedCode = normalizeBankCode(bank_code || name);
    if (!derivedCode) return res.status(400).json({ error: 'bank_code is required.' });

    // Optional: validate basic lengths
    if (derivedCode.length > 20) return res.status(400).json({ error: 'bank_code too long (max 20).' });
    if (currency_code && String(currency_code).length !== 3) {
      return res.status(400).json({ error: 'currency_code must be 3 characters (e.g., MYR).' });
    }

    await dbPromise.query(
      `INSERT INTO banks (bank_name, bank_code, currency_code, type, status)
       VALUES (?, ?, ?, ?, ?)`,
      [name, derivedCode, currency_code, type, status]
    );

    res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Bank name or bank code already exists.' });
    }
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Failed to add bank.' });
  }
};

exports.updateBank = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      bank_code,                       // NEW
      currency_code,
      type,
      status,
    } = req.body || {};

    if (!id) return res.status(400).json({ error: 'Missing id.' });
    if (!name) return res.status(400).json({ error: 'Bank name is required.' });

    const normalizedCode = normalizeBankCode(bank_code || name);
    if (!normalizedCode) return res.status(400).json({ error: 'bank_code is required.' });
    if (normalizedCode.length > 20) return res.status(400).json({ error: 'bank_code too long (max 20).' });
    if (currency_code && String(currency_code).length !== 3) {
      return res.status(400).json({ error: 'currency_code must be 3 characters (e.g., MYR).' });
    }

    await dbPromise.query(
      `UPDATE banks
       SET bank_name = ?, bank_code = ?, currency_code = ?, type = ?, status = ?
       WHERE id = ?`,
      [name, normalizedCode, currency_code, type, status, id]
    );

    res.json({ success: true });
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Bank name or bank code already exists.' });
    }
    console.error('DB Error:', err);
    res.status(500).json({ error: 'Failed to update bank.' });
  }
};

exports.deleteBank = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query(`DELETE FROM banks WHERE id=?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete bank.' });
  }
};

// ========== CURRENCY CODES ==========
exports.getCurrencies = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM currency_codes ORDER BY code`);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch currencies.' });
  }
};

exports.addCurrency = async (req, res) => {
  const { code, name, status } = req.body;
  try {
    await dbPromise.query(`INSERT INTO currency_codes (code, name, status) VALUES (?, ?, ?)`,
      [code, name, status]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add currency.' });
  }
};

exports.updateCurrency = async (req, res) => {
  const { id } = req.params;
  const { code, name, status } = req.body;
  try {
    await dbPromise.query(`UPDATE currency_codes SET code=?, name=?, status=? WHERE id=?`,
      [code, name, status, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update currency.' });
  }
};

exports.deleteCurrency = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query(`DELETE FROM currency_codes WHERE id=?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete currency.' });
  }
};

// ========== CURRENCY RATES ==========
exports.getRates = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
SELECT 
  cr.*, 
  b.bank_name AS bank_name, 
  cc.name AS to_currency_name 
FROM currency_rates cr
LEFT JOIN banks b ON cr.bank_id = b.id
LEFT JOIN currency_codes cc ON cr.to_code = cc.code
ORDER BY cr.effective_date DESC
LIMIT 0, 1000;
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch currency rates.' });
  }
};


exports.addRate1 = async (req, res) => {
  const { bank_id, to_code, rate, effective_date, expiry_date, updated_by } = req.body;
  try {
    await dbPromise.query(`INSERT INTO currency_rates 
      (bank_id, from_code, to_code, rate, effective_date, expiry_date, updated_by, updated_at, is_expired)
      VALUES (?, 'MYR', ?, ?, ?, ?, ?, NOW(), false)`,
      [bank_id, to_code, rate, effective_date, expiry_date, updated_by]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add rate.' });
  }
};

exports.addRate1 = async (req, res) => {
  const { bank_id, to_code, rate, effective_date, expiry_date, updated_by } = req.body;

  if (!bank_id || !to_code || !rate || !effective_date || !expiry_date || !updated_by) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    await dbPromise.query(`
      INSERT INTO currency_rates 
      (bank_id, from_code, to_code, rate, effective_date, expiry_date, updated_by, updated_at, is_expired)
      VALUES (?, 'MYR', ?, ?, ?, ?, ?, NOW(), false)
    `, [bank_id, to_code, rate, effective_date, expiry_date, updated_by]);

    res.json({ success: true });
  } catch (err) {
     if (err.code === 'ER_DUP_ENTRY') {
    return res.status(400).json({ error: 'Rate already exists for this bank, currency, and date.' });
  }
  console.error('Add Rate Error:', err);
  res.status(500).json({ error: 'Failed to add rate.' });
  }
};

exports.addRate = async (req, res) => {
  const FROM_CODE = 'MYR';
  const { bank_id = null, to_code, rate, effective_date, expiry_date, updated_by } = req.body;

  // Basic validation
  if (!to_code || updated_by == null || !effective_date) {//if (!bank_id || !to_code || updated_by == null || !effective_date) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (rate == null || typeof rate !== 'number' || !isFinite(rate) || rate <= 0) {
    return res.status(400).json({ error: 'Rate must be a positive number.' });
  }
  if (to_code === FROM_CODE) {
    return res.status(400).json({ error: 'to_code cannot be the same as from_code.' });
  }

  const eff = new Date(effective_date);
  const exp = expiry_date ? new Date(expiry_date) : null;

  if (isNaN(eff.getTime())) {
    return res.status(400).json({ error: 'effective_date is invalid.' });
  }
  if (exp && (isNaN(exp.getTime()) || eff > exp)) {
    return res.status(400).json({ error: 'expiry_date is invalid or earlier than effective_date.' });
  }

  try {
    // Compute is_expired at insert time (optional — or drop the column entirely)
    // We pass expiry_date twice: once to store, once to evaluate against CURDATE()
    const [result] = await dbPromise.query(
      `
      INSERT INTO currency_rates 
      (bank_id, from_code, to_code, rate, effective_date, expiry_date, updated_by, updated_at, is_expired)
      VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ( ? IS NOT NULL AND ? < CURDATE() ))
      `,
      [bank_id, FROM_CODE, to_code, rate, effective_date, expiry_date || null, updated_by, expiry_date || null, expiry_date || null]
    );

    // Return the inserted row (joined, like your getters)
    const [rows] = await dbPromise.query(
      `
      SELECT cr.*, b.bank_name, cc.name AS to_currency_name
      FROM currency_rates cr
      LEFT JOIN banks b ON cr.bank_id = b.id
      LEFT JOIN currency_codes cc ON cr.to_code = cc.code
      WHERE cr.id = ?
      `,
      [result.insertId]
    );

    return res.status(201).json({ success: true, id: result.insertId, rate: rows[0] || null });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Rate already exists for this bank, currency, and effective date.' });
    }
    console.error('Add Rate Error:', err);
    return res.status(500).json({ error: 'Failed to add rate.' });
  }
};


exports.updateRate1 = async (req, res) => {
  const { id } = req.params;
  const { rate, effective_date, expiry_date, is_expired, updated_by, bank_id } = req.body;
  try {
    await dbPromise.query(`UPDATE currency_rates 
      SET rate=?, effective_date=?, expiry_date=?, is_expired=?, updated_by=?, updated_at=NOW(), bank_id=?
      WHERE id=?`,
      [rate, effective_date, expiry_date, is_expired, updated_by, bank_id, id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update rate.' });
  }
};

exports.updateRate11 = async (req, res) => {
  const { id } = req.params;
  const { rate, effective_date, expiry_date, is_expired, updated_by, bank_id } = req.body;

  try {
    // Fetch old record first
    const [rows] = await dbPromise.query(`SELECT * FROM currency_rates WHERE id = ?`, [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ error: 'Rate not found.' });

    const old = rows[0];

    // Insert into log
    await dbPromise.query(`
      INSERT INTO currency_rate_logs (
        currency_rate_id, bank_id, from_code, to_code,
        old_rate, new_rate, effective_date, expiry_date,
        updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, old.bank_id, old.from_code, old.to_code,
        old.rate, rate, effective_date, expiry_date, updated_by
      ]
    );

    // Perform update
    await dbPromise.query(`
      UPDATE currency_rates 
      SET rate=?, effective_date=?, expiry_date=?, is_expired=?, updated_by=?, updated_at=NOW(), bank_id=?
      WHERE id=?`,
      [rate, effective_date, expiry_date, is_expired, updated_by, bank_id, id]);

    res.json({ success: true });

  } catch (err) {
    console.error('Rate update failed:', err);
    res.status(500).json({ error: 'Failed to update rate.' });
  }
};

exports.updateRate = async (req, res) => {
  const { id } = req.params;
  const { rate, effective_date, expiry_date, updated_by, bank_id = null} = req.body; // ignore client is_expired

  // ---- validation ----
  if (rate == null || !isFinite(Number(rate)) || Number(rate) <= 0) {
    return res.status(400).json({ error: 'Rate must be a positive number.' });
  }
  if (!effective_date) {
    return res.status(400).json({ error: 'effective_date is required.' });
  }
  const eff = new Date(effective_date);
  const exp = expiry_date ? new Date(expiry_date) : null;
  if (isNaN(eff.getTime())) {
    return res.status(400).json({ error: 'effective_date is invalid.' });
  }
  if (exp && (isNaN(exp.getTime()) || eff > exp)) {
    return res.status(400).json({ error: 'expiry_date is invalid or earlier than effective_date.' });
  }
  if (!updated_by) {
    return res.status(400).json({ error: 'updated_by is required.' });
  }

  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    // lock the row
    const [rows] = await conn.query(
      'SELECT * FROM currency_rates WHERE id = ? FOR UPDATE',
      [id]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Rate not found.' });
    }
    const old = rows[0];

    const newBankId = bank_id ?? old.bank_id;
    const newEff = effective_date;
    const newExp = expiry_date ?? null;

    // optional preflight: avoid duplicate key before UPDATE
    // requires UNIQUE(bank_id, from_code, to_code, effective_date)
    const [dups] = await conn.query(
      `SELECT id FROM currency_rates
       WHERE bank_id = ? AND from_code = ? AND to_code = ? AND effective_date = ?
         AND id <> ?
       LIMIT 1`,
      [newBankId, old.from_code, old.to_code, newEff, id]
    );
    if (dups.length) {
      await conn.rollback();
      return res.status(400).json({ error: 'Another rate with same bank/currency/effective_date exists.' });
    }

    // compute is_expired from dates (don’t trust client)
    // do it in SQL time to avoid TZ drift if you prefer
    const computedIsExpired = newExp ? (new Date(new Date().toDateString()) > new Date(newExp) ? 1 : 0) : 0;

    // audit log (old vs new). Adjust column names to match your schema.
    // inside updateRate, replace the INSERT INTO currency_rate_logs with this:
await conn.query(
  `
  INSERT INTO currency_rate_logs (
    currency_rate_id, bank_id, from_code, to_code,
    old_rate, new_rate, effective_date, expiry_date,
    updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    id,
    old.bank_id,
    old.from_code,
    old.to_code,
    old.rate,
    rate,
    effective_date,   // new effective date you're setting
    expiry_date,      // new expiry date you're setting
    updated_by
  ]
);


    // update
    await conn.query(
      `
      UPDATE currency_rates
      SET bank_id = ?, rate = ?, effective_date = ?, expiry_date = ?, 
          is_expired = ?, updated_by = ?, updated_at = NOW()
      WHERE id = ?
      `,
      [newBankId, rate, newEff, newExp, computedIsExpired, updated_by, id]
    );

    await conn.commit();

    // return the updated, joined row for UI
    const [out] = await dbPromise.query(
      `
      SELECT cr.*, b.bank_name, cc.name AS to_currency_name
      FROM currency_rates cr
      LEFT JOIN banks b ON cr.bank_id = b.id
      LEFT JOIN currency_codes cc ON cr.to_code = cc.code
      WHERE cr.id = ?
      `,
      [id]
    );

    return res.json({ success: true, rate: out[0] || null });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ error: 'Duplicate rate for bank/currency/effective_date.' });
    }
    console.error('Rate update failed:', err);
    return res.status(500).json({ error: 'Failed to update rate.' });
  } finally {
    conn.release();
  }
};


exports.getRateLogs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT l.*, b.bank_name
      FROM currency_rate_logs l
      LEFT JOIN banks b ON l.bank_id = b.id
      ORDER BY l.updated_at DESC
      LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch rate logs.' });
  }
};


exports.deleteRate = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query(`DELETE FROM currency_rates WHERE id=?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete rate.' });
  }
};

exports.getActiveRates = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT cr.*, b.bank_name, cc.name AS to_currency_name
      FROM currency_rates cr
      LEFT JOIN banks b ON cr.bank_id = b.id
      LEFT JOIN currency_codes cc ON cr.to_code = cc.code
      WHERE cr.is_expired = 0
      ORDER BY cr.effective_date DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active rates.' });
  }
};


exports.getLatestRate = async (req, res) => {
  const { bank, to_code } = req.query;

  if (!bank || !to_code) {
    return res.status(400).json({ error: 'Missing bank or to_code parameter.' });
  }

  try {
    const [rows] = await dbPromise.query(`
      SELECT cr.*, b.bank_name, cc.name AS to_currency_name
      FROM currency_rates cr
      JOIN banks b ON cr.bank_id = b.id
      LEFT JOIN currency_codes cc ON cr.to_code = cc.code
      WHERE cr.to_code = ? AND b.bank_name = ? AND cr.is_expired = 0
      ORDER BY cr.effective_date DESC
      LIMIT 1
    `, [to_code, bank]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'No valid rate found.' });
    }

    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch latest rate.' });
  }
};

exports.addRatesBulk = async (req, res) => {
  const { rates } = req.body;

  if (!Array.isArray(rates) || rates.length === 0) {
    return res.status(400).json({ error: 'Invalid or empty rates array.' });
  }

  const errors = [];

  for (const rate of rates) {
    const { bank_id, to_code, rate: rateValue, effective_date, expiry_date, updated_by } = rate;

    if (!bank_id || !to_code || !rateValue || !effective_date || !expiry_date || !updated_by) {
      errors.push({ ...rate, error: 'Missing fields' });
      continue;
    }

    try {
      await dbPromise.query(`
        INSERT INTO currency_rates
        (bank_id, from_code, to_code, rate, effective_date, expiry_date, updated_by, updated_at, is_expired)
        VALUES (?, 'MYR', ?, ?, ?, ?, ?, NOW(), 0)
      `, [bank_id, to_code, rateValue, effective_date, expiry_date, updated_by]);
    } catch (err) {
      errors.push({ ...rate, error: err.message });
    }
  }

  if (errors.length > 0) {
    return res.status(207).json({ success: false, errors });
  }

  res.json({ success: true });
};

exports.getRateMonthSummary = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        b.bank_name,
        cr.to_code,
        COUNT(*) AS rate_updates
      FROM currency_rates cr
      JOIN banks b ON cr.bank_id = b.id
      WHERE MONTH(cr.updated_at) = MONTH(CURDATE()) AND YEAR(cr.updated_at) = YEAR(CURDATE())
      GROUP BY cr.bank_id, cr.to_code
      ORDER BY rate_updates DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate summary.' });
  }
};

exports.getRateHistory1 = async (req, res) => {
  const { bank_id, to_code } = req.query;

  if (!bank_id || !to_code) {
    return res.status(400).json({ error: 'Missing bank_id or to_code' });
  }

  try {
    const [rows] = await dbPromise.query(`
      SELECT * FROM currency_rate_logs 
      WHERE bank_id = ? AND to_code = ?
      ORDER BY updated_at DESC
    `, [bank_id, to_code]);

    res.json(rows);
  } catch (err) {
    console.error('Fetch history failed:', err);
    res.status(500).json({ error: 'Failed to fetch rate history' });
  }
};


exports.getRateHistory = async (req, res) => {
  const to_code = (req.query.to_code || '').toString().trim().toUpperCase().slice(0, 3);
  const from_code = (req.query.from_code || 'MYR').toString().trim().toUpperCase().slice(0, 3);
  const bank_id = req.query.bank_id ? Number(req.query.bank_id) : null; // optional

  if (!to_code) {
    return res.status(400).json({ error: 'Missing to_code' });
  }

  try {
    const [rows] = await dbPromise.query(
      `
      SELECT *
      FROM currency_rate_logs 
      WHERE from_code = ? AND to_code = ?
        AND (? IS NULL OR bank_id = ?)
      ORDER BY updated_at DESC
      `,
      [from_code, to_code, bank_id, bank_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Fetch history failed:', err);
    res.status(500).json({ error: 'Failed to fetch rate history' });
  }
};