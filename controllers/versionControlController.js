const { dbPromise } = require('../models/db');

// Get all version control logs
exports.getVersionLogs = async (req, res) => {
  try {
    const { table_name, start_date, end_date } = req.query;
    
    let sql = `SELECT * FROM version_control_logs WHERE 1=1`;
    const params = [];
    
    if (table_name) {
      sql += ` AND table_name = ?`;
      params.push(table_name);
    }
    
    if (start_date) {
      sql += ` AND created_at  >= ?`;
      params.push(start_date);
    }
    
    if (end_date) {
      sql += ` AND created_at  <= ?`;
      params.push(end_date);
    }
    
    sql += ` ORDER BY created_at  DESC`;
    
    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching version logs:', err);
    res.status(500).json({ error: 'Failed to fetch version logs' });
  }
};

// Log a version change (internal use)
exports.logChange = async (table_name, change_description, changed_by) => {
  try {
    const sql = `INSERT INTO version_control_logs 
                (table_name, change_description, changed_by, change_date, created_at) 
                VALUES (?, ?, ?, NOW(), NOW())`;

    await dbPromise.query(sql, [
      table_name,
      change_description,
      changed_by
    ]);
  } catch (err) {
    console.error('Error logging version change:', err);
  }
};

// Middleware to log changes automatically
exports.logChangesMiddleware = (req, res, next) => {
  const originalJson = res.json;

  res.json = function (data) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const updated_by = req.user ? req.user.id : 'system';
      const table = req.baseUrl.split('/').pop();
      const description = `Data modified via ${req.method}: ${JSON.stringify(req.body)}`;

      // ✅ Avoid circular reference
      exports.logChange(table, description, updated_by);
    }

    return originalJson.call(this, data);
  };

  next();
};
