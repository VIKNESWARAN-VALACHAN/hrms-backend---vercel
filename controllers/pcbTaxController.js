// pcbTaxController.js
const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// List all
exports.getAllPCB = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM pcb_tax_table ORDER BY income_from ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch PCB brackets' });
  }
};

// Get one
exports.getPCB = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM pcb_tax_table WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch' });
  }
};

// Create
exports.createPCB = async (req, res) => {
  try {
    const { income_from, income_to, tax_rate, tax_amount, marital_status, num_children } = req.body;
    const sql = `INSERT INTO pcb_tax_table (income_from, income_to, tax_rate, tax_amount, marital_status, num_children)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    const [result] = await dbPromise.query(sql, [
      income_from, income_to, tax_rate, tax_amount, marital_status, num_children
    ]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create' });
  }
};

// Update
exports.updatePCB = async (req, res) => {
  try {
    const { income_from, income_to, tax_rate, tax_amount, marital_status, num_children } = req.body;
    const sql = `UPDATE pcb_tax_table SET 
                   income_from = ?, income_to = ?, tax_rate = ?, tax_amount = ?, 
                   marital_status = ?, num_children = ? WHERE id = ?`;
    await dbPromise.query(sql, [
      income_from, income_to, tax_rate, tax_amount, marital_status, num_children, req.params.id
    ]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update' });
  }
};

// Delete
exports.deletePCB = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM pcb_tax_table WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete' });
  }
};
