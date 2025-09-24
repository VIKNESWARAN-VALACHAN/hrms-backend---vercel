// const { dbPromise } = require('../models/db');
// const ExcelJS = require('exceljs');


// // Get all allowance types
// exports.getAllAllowances = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query('SELECT * FROM allowance_master ORDER BY name');
//     res.json(rows);
//   } catch (err) {
//     console.error('Error fetching allowance types:', err);
//     res.status(500).json({ error: 'Failed to fetch allowance types' });
//   }
// };

// // Get single allowance
// exports.getAllowance = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(
//       `SELECT * FROM allowance_master WHERE id = ?`,
//       [req.params.id]
//     );

//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Allowance not found' });
//     }

//     res.json(rows[0]);
//   } catch (err) {
//     console.error('Error fetching allowance:', err);
//     res.status(500).json({ error: 'Failed to fetch allowance' });
//   }
// };

// // Create new allowance type
// exports.createAllowance = async (req, res) => {
//   try {
//     const {
//       name,
//       is_taxable,
//       max_limit,
//       is_bonus,
//       is_epf_eligible,
//       is_socso_eligible,
//       is_eis_eligible
//     } = req.body;

//     if (!name) {
//       return res.status(400).json({ error: 'Name is required' });
//     }

//     const sql = `
//       INSERT INTO allowance_master 
//         (name, is_taxable, max_limit, is_bonus, is_epf_eligible, is_socso_eligible, is_eis_eligible)
//       VALUES (?, ?, ?, ?, ?, ?, ?)
//     `;
//     const params = [
//       name,
//       is_taxable ? 1 : 0,
//       max_limit || 0,
//       is_bonus ? 1 : 0,
//       is_epf_eligible ? 1 : 0,
//       is_socso_eligible ? 1 : 0,
//       is_eis_eligible ? 1 : 0,
//     ];

//     const [result] = await dbPromise.query(sql, params);
//     res.status(201).json({ id: result.insertId });
//   } catch (err) {
//     console.error('Error creating allowance:', err);
//     res.status(500).json({ error: 'Failed to create allowance type' });
//   }
// };

// // Update existing allowance type
// exports.updateAllowance = async (req, res) => {
//   try {
//     const {
//       name,
//       is_taxable,
//       max_limit,
//       is_bonus,
//       is_epf_eligible,
//       is_socso_eligible,
//       is_eis_eligible
//     } = req.body;

//     const sql = `
//       UPDATE allowance_master 
//       SET name = ?, is_taxable = ?, max_limit = ?, is_bonus = ?, 
//           is_epf_eligible = ?, is_socso_eligible = ?, is_eis_eligible = ?, updated_at = NOW()
//       WHERE id = ?
//     `;
//     const params = [
//       name,
//       is_taxable ? 1 : 0,
//       max_limit || 0,
//       is_bonus ? 1 : 0,
//       is_epf_eligible ? 1 : 0,
//       is_socso_eligible ? 1 : 0,
//       is_eis_eligible ? 1 : 0,
//       req.params.id
//     ];

//     const [result] = await dbPromise.query(sql, params);
//     res.json({ success: true });
//   } catch (err) {
//     console.error('Error updating allowance:', err);
//     res.status(500).json({ error: 'Failed to update allowance type' });
//   }
// };


// // Delete allowance type
// exports.deleteAllowance = async (req, res) => {
//   try {
//     await dbPromise.query('DELETE FROM allowance_master WHERE id = ?', [req.params.id]);
//     res.json({ success: true });
//   } catch (err) {
//     console.error('Error deleting allowance type:', err);
//     res.status(500).json({ error: 'Failed to delete allowance type' });
//   }
// };


// // Export to Excel
// exports.exportAllowances = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query('SELECT * FROM allowance_master ORDER BY name');
    
//     const workbook = new ExcelJS.Workbook();
//     const sheet = workbook.addWorksheet('Allowance Types');
    
//     sheet.columns = [
//       { header: 'Name', key: 'name' },
//       { header: 'Taxable', key: 'is_taxable' },
//       { header: 'Max Limit', key: 'max_limit' }
//     ];

    
//     sheet.addRows(rows);
    
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', 'attachment; filename=allowance_types.xlsx');
//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (err) {
//     console.error('Error exporting allowance types:', err);
//     res.status(500).json({ error: 'Failed to export allowance types' });
//   }
// };

const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');


// Get all allowance types
exports.getAllAllowances = async (req, res) => {
  try {
    // Select the new prorate_by_percentage column
    const [rows] = await dbPromise.query('SELECT * FROM allowance_master ORDER BY name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching allowance types:', err);
    res.status(500).json({ error: 'Failed to fetch allowance types' });
  }
};

// Get single allowance
exports.getAllowance = async (req, res) => {
  try {
    // Select the new prorate_by_percentage column
    const [rows] = await dbPromise.query(
      `SELECT * FROM allowance_master WHERE id = ?`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Allowance not found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching allowance:', err);
    res.status(500).json({ error: 'Failed to fetch allowance' });
  }
};

// Create new allowance type
exports.createAllowance = async (req, res) => {
  try {
    const {
      name,
      is_taxable,
      max_limit,
      is_bonus,
      is_epf_eligible,
      is_socso_eligible,
      is_eis_eligible,
      prorate_by_percentage // Add new field
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const sql = `
      INSERT INTO allowance_master
        (name, is_taxable, max_limit, is_bonus, is_epf_eligible, is_socso_eligible, is_eis_eligible, prorate_by_percentage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const params = [
      name,
      is_taxable ? 1 : 0,
      max_limit || 0,
      is_bonus ? 1 : 0,
      is_epf_eligible ? 1 : 0,
      is_socso_eligible ? 1 : 0,
      is_eis_eligible ? 1 : 0,
      prorate_by_percentage ? 1 : 0, // Convert boolean to tinyint
    ];

    const [result] = await dbPromise.query(sql, params);
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating allowance:', err);
    res.status(500).json({ error: 'Failed to create allowance type' });
  }
};

// Update existing allowance type
exports.updateAllowance = async (req, res) => {
  try {
    const {
      name,
      is_taxable,
      max_limit,
      is_bonus,
      is_epf_eligible,
      is_socso_eligible,
      is_eis_eligible,
      prorate_by_percentage // Add new field
    } = req.body;

    const sql = `
      UPDATE allowance_master
      SET name = ?, is_taxable = ?, max_limit = ?, is_bonus = ?,
          is_epf_eligible = ?, is_socso_eligible = ?, is_eis_eligible = ?, prorate_by_percentage = ?, updated_at = NOW()
      WHERE id = ?
    `;
    const params = [
      name,
      is_taxable ? 1 : 0,
      max_limit || 0,
      is_bonus ? 1 : 0,
      is_epf_eligible ? 1 : 0,
      is_socso_eligible ? 1 : 0,
      is_eis_eligible ? 1 : 0,
      prorate_by_percentage ? 1 : 0, // Convert boolean to tinyint
      req.params.id
    ];

    const [result] = await dbPromise.query(sql, params);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating allowance:', err);
    res.status(500).json({ error: 'Failed to update allowance type' });
  }
};


// Delete allowance type
exports.deleteAllowance = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM allowance_master WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting allowance type:', err);
    res.status(500).json({ error: 'Failed to delete allowance type' });
  }
};


// Export to Excel
exports.exportAllowances = async (req, res) => {
  try {
    // Select the new prorate_by_percentage column
    const [rows] = await dbPromise.query('SELECT *, prorate_by_percentage FROM allowance_master ORDER BY name');
    
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Allowance Types');
    
    sheet.columns = [
      { header: 'Name', key: 'name' },
      { header: 'Taxable', key: 'is_taxable' },
      { header: 'Max Limit', key: 'max_limit' },
      { header: 'Is Bonus', key: 'is_bonus' }, // Added for completeness
      { header: 'EPF Eligible', key: 'is_epf_eligible' }, // Added for completeness
      { header: 'SOCSO Eligible', key: 'is_socso_eligible' }, // Added for completeness
      { header: 'EIS Eligible', key: 'is_eis_eligible' }, // Added for completeness
      { header: 'Prorated by Percentage', key: 'prorate_by_percentage' } // Add new column to Excel export
    ];

    // Map boolean fields to 'Yes'/'No' for better readability in Excel
    const processedRows = rows.map(row => ({
      ...row,
      is_taxable: row.is_taxable ? 'Yes' : 'No',
      is_bonus: row.is_bonus ? 'Yes' : 'No',
      is_epf_eligible: row.is_epf_eligible ? 'Yes' : 'No',
      is_socso_eligible: row.is_socso_eligible ? 'Yes' : 'No',
      is_eis_eligible: row.is_eis_eligible ? 'Yes' : 'No',
      prorate_by_percentage: row.prorate_by_percentage ? 'Yes' : 'No',
    }));

    sheet.addRows(processedRows);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=allowance_types.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting allowance types:', err);
    res.status(500).json({ error: 'Failed to export allowance types' });
  }
};