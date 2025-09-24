const { dbPromise } = require('../models/db');


exports.getApprovalConfig = async (req, res) => {
  const { module, company_id } = req.query;

  let query = 'SELECT * FROM approval_flow_settings';
  const params = [];

  if (module && company_id) {
    query += ' WHERE module = ? AND company_id = ?';
    params.push(module, company_id);
  } else if (module) {
    query += ' WHERE module = ?';
    params.push(module);
  } else if (company_id) {
    query += ' WHERE company_id = ?';
    params.push(company_id);
  }

  try {
    const [results] = await dbPromise.query(query, params);
    res.json(results);
  } catch (err) {
    console.error('Error fetching approval configs:', err);
    res.status(500).json({ error: 'Failed to fetch approval configs' });
  }
};



exports.createApprovalConfig = async (req, res) => {
  const { module, company_id, final_level } = req.body;
  try {
    const [existing] = await dbPromise.query(
      'SELECT * FROM approval_flow_settings WHERE module = ? AND company_id = ?',
      [module, company_id]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Config already exists' });
    }

    await dbPromise.query(
      'INSERT INTO approval_flow_settings (module, company_id, final_level) VALUES (?, ?, ?)',
      [module, company_id, final_level]
    );
    res.json({ message: 'Approval config created' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create config' });
  }
};

exports.updateApprovalConfig = async (req, res) => {
  const { id } = req.params;
  const { final_level } = req.body;
  try {
    await dbPromise.query(
      'UPDATE approval_flow_settings SET final_level = ? WHERE id = ?',
      [final_level, id]
    );
    res.json({ message: 'Approval config updated' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update config' });
  }
};

exports.deleteApprovalConfig = async (req, res) => {
  const { id } = req.params;
  try {
    await dbPromise.query('DELETE FROM approval_flow_settings WHERE id = ?', [id]);
    res.json({ message: 'Approval config deleted' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete config' });
  }
};


