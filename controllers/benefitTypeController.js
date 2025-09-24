// controllers/benefitTypeController.js
const { dbPromise } = require('../models/db');

// Get all benefit types
exports.getAllBenefitTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM benefit_types ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching benefit types:', err);
    res.status(500).json({ error: 'Failed to fetch benefit types' });
  }
};

// Get single benefit type
exports.getBenefitType = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM benefit_types WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Benefit type not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching benefit type:', err);
    res.status(500).json({ error: 'Failed to fetch benefit type' });
  }
};

// Create new benefit type
exports.createBenefitType = async (req, res) => {
  try {
    const { name, description } = req.body;
    const [result] = await dbPromise.query('INSERT INTO benefit_types (name, description) VALUES (?, ?)', [name, description]);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating benefit type:', err);
    res.status(500).json({ error: 'Failed to create benefit type' });
  }
};

// Update benefit type
exports.updateBenefitType = async (req, res) => {
  try {
    const { name, description } = req.body;
    await dbPromise.query('UPDATE benefit_types SET name = ?, description = ? WHERE id = ?', [name, description, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating benefit type:', err);
    res.status(500).json({ error: 'Failed to update benefit type' });
  }
};

// Delete benefit type
exports.deleteBenefitType = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM benefit_types WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting benefit type:', err);
    res.status(500).json({ error: 'Failed to delete benefit type' });
  }
};