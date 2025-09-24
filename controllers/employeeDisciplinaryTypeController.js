const { dbPromise } = require('../models/db');


// Get all types
exports.getAllTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query('SELECT * FROM employee_disciplinary_types ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching types:', err);
    res.status(500).json({ error: 'Failed to fetch disciplinary types' });
  }
};

// Get single type by ID
exports.getTypeById = async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await dbPromise.query('SELECT * FROM employee_disciplinary_types WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Disciplinary type not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching type by ID:', err);
    res.status(500).json({ error: 'Failed to fetch disciplinary type' });
  }
};

// Create new type
exports.createType = async (req, res) => {
  const { name, description, created_by } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name is required' });
  }

  try {
    const [result] = await dbPromise.query(
      'INSERT INTO employee_disciplinary_types (name, description, created_by) VALUES (?, ?, ?)',
      [name, description || '', created_by || null]
    );
    res.status(201).json({ id: result.insertId, name, description });
  } catch (err) {
    console.error('Error creating type:', err);
    res.status(500).json({ error: 'Failed to create disciplinary type' });
  }
};

// Update existing type
exports.updateType = async (req, res) => {
  const { id } = req.params;
  const { name, description, updated_by } = req.body;

  try {
    const [result] = await dbPromise.query(
      'UPDATE employee_disciplinary_types SET name = ?, description = ?, updated_by = ? WHERE id = ?',
      [name, description || '', updated_by || null, id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Disciplinary type not found' });
    }
    res.json({ message: 'Disciplinary type updated successfully' });
  } catch (err) {
    console.error('Error updating type:', err);
    res.status(500).json({ error: 'Failed to update disciplinary type' });
  }
};

// Delete type
exports.deleteType = async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await dbPromise.query(
      'DELETE FROM employee_disciplinary_types WHERE id = ?',
      [id]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Disciplinary type not found' });
    }
    res.json({ message: 'Disciplinary type deleted successfully' });
  } catch (err) {
    console.error('Error deleting type:', err);
    res.status(500).json({ error: 'Failed to delete disciplinary type' });
  }
};