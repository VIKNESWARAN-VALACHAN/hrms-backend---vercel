const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// Get all relief categories
exports.getAllReliefs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT * FROM relief_categories 
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching relief categories:', err);
    res.status(500).json({ error: 'Failed to fetch relief categories' });
  }
};

// Create new relief category
exports.createRelief = async (req, res) => {
  try {
    const { name, amount } = req.body;
    const sql = `INSERT INTO relief_categories (name, amount) VALUES (?, ?)`;
    const [result] = await dbPromise.query(sql, [
      name, amount || null
    ]);
    
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating relief category:', err);
    res.status(500).json({ error: 'Failed to create relief category' });
  }
};

// Update relief category
exports.updateRelief = async (req, res) => {
  try {
    const { name, amount } = req.body;

    const sql = `UPDATE relief_categories SET name = ?, amount = ? WHERE id = ?`;

    await dbPromise.query(sql, [name, amount || 0, req.params.id]); // only this

    res.json({ success: true });
  } catch (err) {
    console.error('Error updating relief category:', err);
    res.status(500).json({ error: 'Failed to update relief category' });
  }
};


// Toggle relief category status
exports.toggleReliefStatus = async (req, res) => {
  try {
    await dbPromise.query(`
      UPDATE relief_categories 
      SET is_active = NOT is_active 
      WHERE id = ?
    `, [req.params.id]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error toggling relief status:', err);
    res.status(500).json({ error: 'Failed to toggle relief status' });
  }
};

// Export to Excel
exports.exportReliefs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT * FROM relief_categories 
      ORDER BY name
    `);
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tax Relief Categories');
    
    sheet.columns = [
      { header: 'Name', key: 'name' },
      { header: 'Amount', key: 'amount' }
    ];

    
    sheet.addRows(rows);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=tax_reliefs.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting relief categories:', err);
    res.status(500).json({ error: 'Failed to export relief categories' });
  }
};

// Delete relief category
exports.deleteRelief = async (req, res) => {
  try {
    const { id } = req.params;

    const sql = `DELETE FROM relief_categories WHERE id = ?`;
    await dbPromise.query(sql, [id]);

    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting relief category:', err);
    res.status(500).json({ error: 'Failed to delete relief category' });
  }
};
