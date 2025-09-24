const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// Get all payroll configurations
exports.getAllConfigs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM payroll_config ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching payroll configs:', err);
    res.status(500).json({ error: 'Failed to fetch payroll configurations' });
  }
};

// Get single payroll config
exports.getConfig = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM payroll_config WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Payroll config not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching payroll config:', err);
    res.status(500).json({ error: 'Failed to fetch payroll configuration' });
  }
};

// Create new payroll config
exports.createConfig = async (req, res) => {
  try {
    const {
      pay_interval, cutoff_day, payment_day, late_penalty_type,
      late_penalty_amount, ot_multiplier, default_currency, auto_carry_forward
    } = req.body;

    const sql = `INSERT INTO payroll_config (
      pay_interval, cutoff_day, payment_day, late_penalty_type,
      late_penalty_amount, ot_multiplier, default_currency, auto_carry_forward
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

    const [result] = await dbPromise.query(sql, [
      pay_interval, cutoff_day, payment_day, late_penalty_type,
      late_penalty_amount, ot_multiplier, default_currency, auto_carry_forward
    ]);

    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating payroll config:', err);
    res.status(500).json({ error: 'Failed to create payroll configuration' });
  }
};

// Update payroll config
exports.updateConfig = async (req, res) => {
  try {
    const {
      pay_interval, cutoff_day, payment_day, late_penalty_type,
      late_penalty_amount, ot_multiplier, default_currency, auto_carry_forward
    } = req.body;

    const sql = `UPDATE payroll_config SET 
      pay_interval = ?, cutoff_day = ?, payment_day = ?, late_penalty_type = ?,
      late_penalty_amount = ?, ot_multiplier = ?, default_currency = ?, auto_carry_forward = ?
      WHERE id = ?`;

    await dbPromise.query(sql, [
      pay_interval, cutoff_day, payment_day, late_penalty_type,
      late_penalty_amount, ot_multiplier, default_currency, auto_carry_forward,
      req.params.id
    ]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating payroll config:', err);
    res.status(500).json({ error: 'Failed to update payroll configuration' });
  }
};

// Delete payroll config
exports.deleteConfig = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM payroll_config WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting payroll config:', err);
    res.status(500).json({ error: 'Failed to delete payroll configuration' });
  }
};

// Export single config
exports.exportConfig = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT * FROM payroll_config WHERE id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Config not found' });
    }

    const config = rows[0];
    
    // Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Payroll Config');
    
    // Add config data
    sheet.columns = [
      { header: 'Property', key: 'property' },
      { header: 'Value', key: 'value' }
    ];
    
    Object.entries(config).forEach(([key, value]) => {
      if (key !== 'id') {
        sheet.addRow({ property: key, value });
      }
    });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=payroll_config_${config.id}.xlsx`);
    
    // Send the file
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting config:', err);
    res.status(500).json({ error: 'Failed to export config' });
  }
};