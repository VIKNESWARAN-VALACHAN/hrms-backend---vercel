const { dbPromise } = require('../models/db');

// Utility function for error handling
const handleDbError = (res, err, operation) => {
  console.error(`Error ${operation} dependents:`, err);
  res.status(500).json({ 
    success: false,
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
};

// Add validation middleware
const validateDependent = (req, res, next) => {
  const { full_name, relationship, birth_date } = req.body;
  
  if (!full_name || !relationship || !birth_date) {
    return res.status(400).json({ 
      success: false,
      error: 'Full name, relationship and birth date are required' 
    });
  }
  
  // Convert checkbox values to proper booleans
  req.body.is_disabled = !!req.body.is_disabled;
  req.body.is_studying = !!req.body.is_studying;
  
  // Ensure child_relief_percent is a number
  req.body.child_relief_percent = Number(req.body.child_relief_percent) || 0;
  
  next();
};

// Get all dependents for an employee
exports.getDependentsByEmployee = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM employee_dependents WHERE employee_id = ?`,
      [req.params.employeeId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    handleDbError(res, err, 'fetching');
  }
};

// Create a single dependent
exports.createDependent = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const dependentData = req.body;

    const [result] = await dbPromise.query(
      `INSERT INTO employee_dependents SET ?`,
      {
        employee_id: employeeId,
        ...dependentData,
        is_disabled: dependentData.is_disabled ? 1 : 0,
        is_studying: dependentData.is_studying ? 1 : 0
      }
    );

    res.status(201).json({ 
      success: true,
      data: {
        id: result.insertId,
        ...dependentData
      }
    });
  } catch (err) {
    handleDbError(res, err, 'creating');
  }
};

// Update a dependent
exports.updateDependent = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      full_name,
      relationship,
      birth_date,
      gender,
      is_disabled = false,
      is_studying = false,
      nationality,
      identification_no,
      notes,
      child_relief_percent = 0.00
    } = req.body;

    const [result] = await dbPromise.query(
      `UPDATE employee_dependents SET ? WHERE id = ?`,
      [
        {
          full_name,
          relationship,
          birth_date,
          gender,
          is_disabled: is_disabled ? 1 : 0,
          is_studying: is_studying ? 1 : 0,
          nationality,
          identification_no,
          notes,
          child_relief_percent: Number(child_relief_percent)
        },
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Dependent not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Dependent updated successfully' 
    });
  } catch (err) {
    handleDbError(res, err, 'updating');
  }
};

// Delete a dependent
exports.deleteDependent = async (req, res) => {
  try {
    const [result] = await dbPromise.query(
      `DELETE FROM employee_dependents WHERE id = ?`,
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ 
        success: false,
        error: 'Dependent not found' 
      });
    }

    res.json({ 
      success: true,
      message: 'Dependent deleted successfully' 
    });
  } catch (err) {
    handleDbError(res, err, 'deleting');
  }
};

// Bulk create dependents
exports.bulkCreateDependents = async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { dependents } = req.body;

    // Validate employeeId
    if (!employeeId || isNaN(employeeId)) {
      return res.status(400).json({ 
        success: false,
        error: 'Valid employee_id is required in URL' 
      });
    }

    // Validate dependents array
    if (!Array.isArray(dependents)) {
      return res.status(400).json({ 
        success: false,
        error: 'Dependents must be an array' 
      });
    }

    // Prepare values for batch insert
    const values = dependents.map(dep => {
      // Validate required fields for each dependent
      if (!dep.full_name || !dep.relationship || !dep.birth_date) {
        throw new Error('Each dependent requires full_name, relationship and birth_date');
      }

      return [
        parseInt(employeeId),
        dep.full_name,
        dep.relationship,
        dep.birth_date,
        dep.gender || null,
        dep.is_disabled ? 1 : 0,
        dep.is_studying ? 1 : 0,
        dep.nationality || null,
        dep.identification_no || null,
        dep.notes || null,
        Number(dep.child_relief_percent) || 0
      ];
    });

    // Execute batch insert
    const [result] = await dbPromise.query(
      `INSERT INTO employee_dependents (
        employee_id, full_name, relationship, birth_date, gender,
        is_disabled, is_studying, nationality, identification_no, notes, child_relief_percent
      ) VALUES ?`,
      [values]
    );

    res.status(201).json({
      success: true,
      message: `${result.affectedRows} dependents added successfully`,
      count: result.affectedRows
    });
  } catch (err) {
    if (err.message.includes('required')) {
      return res.status(400).json({ 
        success: false,
        error: err.message 
      });
    }
    handleDbError(res, err, 'bulk creating');
  }
};