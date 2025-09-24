// const { dbPromise } = require('../models/db');
// const ExcelJS = require('exceljs');

// // Get all deduction types
// exports.getAllDeductions = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(`
//       SELECT 
//         id,
//         name,
//         max_limit,
//         is_recurring,
//         is_epf ,
//         is_socso ,
//         is_eis ,
//         prorate_by_percentage, 
//         is_bonus,             
//         is_taxable,           
//         created_at,
//         updated_at
//       FROM deduction_master
//       ORDER BY name ASC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error('Error fetching deduction types:', err);
//     res.status(500).json({ error: 'Failed to fetch deduction types' });
//   }
// };

// // Get single deduction
// exports.getDeduction = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(`
//       SELECT 
//         id, 
//         name, 
//         is_recurring, 
//         max_limit, 
//         is_epf,
//         is_socso,
//         is_eis,
//         prorate_by_percentage, 
//         is_bonus,             
//         is_taxable,           
//         created_at, 
//         updated_at
//       FROM deduction_master
//       WHERE id = ?
//     `, [req.params.id]);
    
//     if (rows.length === 0) {
//       return res.status(404).json({ error: 'Deduction not found' });
//     }
//     res.json(rows[0]);
//   } catch (err) {
//     console.error('Error fetching deduction:', err);
//     res.status(500).json({ error: 'Failed to fetch deduction' });
//   }
// };

// // Create new deduction type
// exports.createDeduction = async (req, res) => {
//   try {
//     const { 
//       name, 
//       is_recurring, 
//       max_limit, 
//       is_epf, 
//       is_socso, 
//       is_eis,
//       prorate_by_percentage, /* Destructured new column */
//       is_bonus,              /* Destructured new column */
//       is_taxable             /* Destructured new column */
//     } = req.body;
    
//     // Validation: Only one statutory flag can be true
//     // const statutoryFlags = [is_epf, is_socso, is_eis].filter(flag => flag === 1 || flag === true);
//     // if (statutoryFlags.length > 1) {
//     //   return res.status(400).json({ 
//     //     error: 'A deduction can only be one type: EPF, SOCSO, or EIS' 
//     //   });
//     // }
    
//     const sql = `INSERT INTO deduction_master
//                  (name, is_recurring, max_limit, is_epf, is_socso, is_eis, 
//                   prorate_by_percentage, is_bonus, is_taxable)
//                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`; /* Added new placeholders */
                 
//     const [result] = await dbPromise.query(sql, [
//       name, 
//       is_recurring || 0, 
//       max_limit,
//       is_epf || 0,
//       is_socso || 0,
//       is_eis || 0,
//       prorate_by_percentage || 0, /* Added new values */
//       is_bonus || 0,              /* Added new values */
//       is_taxable || 0             /* Added new values */
//     ]);
    
//     res.status(201).json({ id: result.insertId });
//   } catch (err) {
//     console.error('Error creating deduction type:', err);
//     res.status(500).json({ error: 'Failed to create deduction type' });
//   }
// };

// // Update deduction type
// exports.updateDeduction = async (req, res) => {
//   try {
//     const { 
//       name, 
//       is_recurring, 
//       max_limit, 
//       is_epf, 
//       is_socso, 
//       is_eis,
//       prorate_by_percentage, /* Destructured new column */
//       is_bonus,              /* Destructured new column */
//       is_taxable             /* Destructured new column */
//     } = req.body;
    
//     // // Validation: Only one statutory flag can be true
//     // const statutoryFlags = [is_epf, is_socso, is_eis].filter(flag => flag === 1 || flag === true);
//     // if (statutoryFlags.length > 1) {
//     //   return res.status(400).json({ 
//     //     error: 'A deduction can only be one type: EPF, SOCSO, or EIS' 
//     //   });
//     // }
    
//     const sql = `UPDATE deduction_master SET
//                  name = ?, 
//                  is_recurring = ?, 
//                  max_limit = ?,
//                  is_epf = ?,
//                  is_socso = ?,
//                  is_eis = ?,
//                  prorate_by_percentage = ?, 
//                  is_bonus = ?,              
//                  is_taxable = ?             
//                  WHERE id = ?`;
                 
//     await dbPromise.query(sql, [
//       name, 
//       is_recurring || 0, 
//       max_limit,
//       is_epf || 0,
//       is_socso || 0,
//       is_eis || 0,
//       prorate_by_percentage || 0, /* Added new values */
//       is_bonus || 0,              /* Added new values */
//       is_taxable || 0,            /* Added new values */
//       req.params.id
//     ]);
    
//     res.json({ success: true });
//   } catch (err) {
//     console.error('Error updating deduction type:', err);
//     res.status(500).json({ error: 'Failed to update deduction type' });
//   }
// };

// // Delete deduction type
// exports.deleteDeduction = async (req, res) => {
//   try {
//     // // Check if it's a statutory deduction (EPF, SOCSO, or EIS)
//     // const [checkRows] = await dbPromise.query(
//     //   'SELECT name, is_epf, is_socso, is_eis FROM deduction_master WHERE id = ?', 
//     //   [req.params.id]
//     // );
    
//     // if (checkRows.length > 0) {
//     //   const row = checkRows[0];
//     //   if (row.is_epf || row.is_socso || row.is_eis) {
//     //     let statutoryType = '';
//     //     if (row.is_epf) statutoryType = 'EPF';
//     //     else if (row.is_socso) statutoryType = 'SOCSO';
//     //     else if (row.is_eis) statutoryType = 'EIS';
        
//     //     return res.status(400).json({ 
//     //       error: `Cannot delete statutory deduction: ${statutoryType}` 
//     //     });
//     //   }
//     // }
    
//     await dbPromise.query('DELETE FROM deduction_master WHERE id = ?', [req.params.id]);
//     res.json({ success: true });
//   } catch (err) {
//     console.error('Error deleting deduction type:', err);
//     res.status(500).json({ error: 'Failed to delete deduction type' });
//   }
// };

// // Get statutory deductions only (EPF, SOCSO, EIS)
// exports.getStatutoryDeductions = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(`
//       SELECT 
//         id, 
//         name, 
//         is_recurring,
//         max_limit,
//         is_epf,
//         is_socso,
//         is_eis,
//         prorate_by_percentage, 
//         is_bonus,              
//         is_taxable,           
//         created_at,
//         updated_at
//       FROM deduction_master
//       WHERE is_epf = 1 OR is_socso = 1 OR is_eis = 1
//       ORDER BY is_epf DESC, is_socso DESC, is_eis DESC
//     `);
    
//     // Add statutory_type for easier frontend handling
//     const processedRows = rows.map(row => ({
//       ...row,
//       statutory_type: row.is_epf ? 'EPF' : row.is_socso ? 'SOCSO' : row.is_eis ? 'EIS' : null
//     }));
    
//     res.json(processedRows);
//   } catch (err) {
//     console.error('Error fetching statutory deductions:', err);
//     res.status(500).json({ error: 'Failed to fetch statutory deductions' });
//   }
// };

// // Get non-statutory deductions only
// exports.getNonStatutoryDeductions = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(`
//       SELECT 
//         id, 
//         name, 
//         is_recurring,
//         max_limit,
//         prorate_by_percentage,
//         is_bonus,              
//         is_taxable,            
//         created_at,
//         updated_at
//       FROM deduction_master
//       WHERE is_epf = 0 AND is_socso = 0 AND is_eis = 0
//       ORDER BY name ASC
//     `);
//     res.json(rows);
//   } catch (err) {
//     console.error('Error fetching non-statutory deductions:', err);
//     res.status(500).json({ error: 'Failed to fetch non-statutory deductions' });
//   }
// };

// // Export to Excel
// exports.exportDeductions = async (req, res) => {
//   try {
//     const [rows] = await dbPromise.query(`
//       SELECT 
//         name,
//         CASE WHEN is_recurring = 1 THEN 'Recurring' ELSE 'One-time' END as recurrence_type,
//         max_limit,
//         CASE 
//           WHEN is_epf = 1 THEN 'EPF'
//           WHEN is_socso = 1 THEN 'SOCSO' 
//           WHEN is_eis = 1 THEN 'EIS'
//           ELSE 'Regular'
//         END as deduction_type,
//         CASE 
//           WHEN is_epf = 1 OR is_socso = 1 OR is_eis = 1 THEN 'Yes'
//           ELSE 'No'
//         END as is_statutory,
//         CASE WHEN prorate_by_percentage = 1 THEN 'Yes' ELSE 'No' END as prorate_by_percentage_text,
//         CASE WHEN is_bonus = 1 THEN 'Yes' ELSE 'No' END as is_bonus_text,                      
//         CASE WHEN is_taxable = 1 THEN 'Yes' ELSE 'No' END as is_taxable_text,                  
//         created_at,
//         updated_at
//       FROM deduction_master
//       ORDER BY is_epf DESC, is_socso DESC, is_eis DESC, name ASC
//     `);
   
//     const workbook = new ExcelJS.Workbook();
//     const sheet = workbook.addWorksheet('Deduction Types');
   
//     sheet.columns = [
//       { header: 'Name', key: 'name', width: 25 },
//       { header: 'Recurrence Type', key: 'recurrence_type', width: 15 },
//       { header: 'Max Limit', key: 'max_limit', width: 12 },
//       { header: 'Deduction Type', key: 'deduction_type', width: 15 },
//       { header: 'Statutory', key: 'is_statutory', width: 12 },
//       { header: 'Prorate by Percentage', key: 'prorate_by_percentage_text', width: 20 }, /* Added new column header */
//       { header: 'Is Bonus', key: 'is_bonus_text', width: 12 },                       /* Added new column header */
//       { header: 'Is Taxable', key: 'is_taxable_text', width: 12 },                   /* Added new column header */
//       { header: 'Created At', key: 'created_at', width: 20 },
//       { header: 'Updated At', key: 'updated_at', width: 20 }
//     ];
   
//     sheet.addRows(rows);
   
//     // Style the header
//     sheet.getRow(1).font = { bold: true };
//     sheet.getRow(1).fill = {
//       type: 'pattern',
//       pattern: 'solid',
//       fgColor: { argb: 'FFE0E0E0' }
//     };
   
//     res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
//     res.setHeader('Content-Disposition', 'attachment; filename=deduction_types.xlsx');
//     await workbook.xlsx.write(res);
//     res.end();
//   } catch (err) {
//     console.error('Error exporting deduction types:', err);
//     res.status(500).json({ error: 'Failed to export deduction types' });
//   }
// };

const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');

// Get all deduction types
exports.getAllDeductions = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        id,
        name,
        max_limit,
        is_epf ,
        is_socso ,
        is_eis ,
        prorate_by_percentage, 
        is_bonus,           
        is_taxable,         
        created_at,
        updated_at
      FROM deduction_master
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching deduction types:', err);
    res.status(500).json({ error: 'Failed to fetch deduction types' });
  }
};

// Get single deduction
exports.getDeduction = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        id, 
        name, 
        max_limit, 
        is_epf,
        is_socso,
        is_eis,
        prorate_by_percentage, 
        is_bonus,           
        is_taxable,         
        created_at, 
        updated_at
      FROM deduction_master
      WHERE id = ?
    `, [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Deduction not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching deduction:', err);
    res.status(500).json({ error: 'Failed to fetch deduction' });
  }
};

// Create new deduction type
exports.createDeduction = async (req, res) => {
  try {
    const { 
      name, 
      max_limit, 
      is_epf, 
      is_socso, 
      is_eis,
      prorate_by_percentage, 
      is_bonus,           
      is_taxable          
    } = req.body;
    
    const sql = `INSERT INTO deduction_master
                (name, max_limit, is_epf, is_socso, is_eis, 
                 prorate_by_percentage, is_bonus, is_taxable)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                 
    const [result] = await dbPromise.query(sql, [
      name, 
      max_limit,
      is_epf || 0,
      is_socso || 0,
      is_eis || 0,
      prorate_by_percentage || 0,
      is_bonus || 0,           
      is_taxable || 0           
    ]);
    
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating deduction type:', err);
    res.status(500).json({ error: 'Failed to create deduction type' });
  }
};

// Update deduction type
exports.updateDeduction = async (req, res) => {
  try {
    const { 
      name, 
      max_limit, 
      is_epf, 
      is_socso, 
      is_eis,
      prorate_by_percentage,
      is_bonus,           
      is_taxable          
    } = req.body;
    
    const sql = `UPDATE deduction_master SET
                 name = ?, 
                 max_limit = ?,
                 is_epf = ?,
                 is_socso = ?,
                 is_eis = ?,
                 prorate_by_percentage = ?, 
                 is_bonus = ?,          
                 is_taxable = ?          
                 WHERE id = ?`;
                 
    await dbPromise.query(sql, [
      name, 
      max_limit,
      is_epf || 0,
      is_socso || 0,
      is_eis || 0,
      prorate_by_percentage || 0,
      is_bonus || 0,           
      is_taxable || 0,           
      req.params.id
    ]);
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating deduction type:', err);
    res.status(500).json({ error: 'Failed to update deduction type' });
  }
};

// Delete deduction type
exports.deleteDeduction = async (req, res) => {
  try {
    await dbPromise.query('DELETE FROM deduction_master WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting deduction type:', err);
    res.status(500).json({ error: 'Failed to delete deduction type' });
  }
};

// Get statutory deductions only (EPF, SOCSO, EIS)
exports.getStatutoryDeductions = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        id, 
        name, 
        max_limit,
        is_epf,
        is_socso,
        is_eis,
        prorate_by_percentage, 
        is_bonus,            
        is_taxable,          
        created_at,
        updated_at
      FROM deduction_master
      WHERE is_epf = 1 OR is_socso = 1 OR is_eis = 1
      ORDER BY is_epf DESC, is_socso DESC, is_eis DESC
    `);
    
    // Add statutory_type for easier frontend handling
    const processedRows = rows.map(row => ({
      ...row,
      statutory_type: row.is_epf ? 'EPF' : row.is_socso ? 'SOCSO' : row.is_eis ? 'EIS' : null
    }));
    
    res.json(processedRows);
  } catch (err) {
    console.error('Error fetching statutory deductions:', err);
    res.status(500).json({ error: 'Failed to fetch statutory deductions' });
  }
};

// Get non-statutory deductions only
exports.getNonStatutoryDeductions = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        id, 
        name, 
        max_limit,
        prorate_by_percentage,
        is_bonus,            
        is_taxable,          
        created_at,
        updated_at
      FROM deduction_master
      WHERE is_epf = 0 AND is_socso = 0 AND is_eis = 0
      ORDER BY name ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching non-statutory deductions:', err);
    res.status(500).json({ error: 'Failed to fetch non-statutory deductions' });
  }
};

// Export to Excel
exports.exportDeductions = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        name,
        max_limit,
        CASE 
          WHEN is_epf = 1 THEN 'EPF'
          WHEN is_socso = 1 THEN 'SOCSO' 
          WHEN is_eis = 1 THEN 'EIS'
          ELSE 'Regular'
        END as deduction_type,
        CASE 
          WHEN is_epf = 1 OR is_socso = 1 OR is_eis = 1 THEN 'Yes'
          ELSE 'No'
        END as is_statutory,
        CASE WHEN prorate_by_percentage = 1 THEN 'Yes' ELSE 'No' END as prorate_by_percentage_text,
        CASE WHEN is_bonus = 1 THEN 'Yes' ELSE 'No' END as is_bonus_text,               
        CASE WHEN is_taxable = 1 THEN 'Yes' ELSE 'No' END as is_taxable_text,            
        created_at,
        updated_at
      FROM deduction_master
      ORDER BY is_epf DESC, is_socso DESC, is_eis DESC, name ASC
    `);
   
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Deduction Types');
   
    sheet.columns = [
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Max Limit', key: 'max_limit', width: 12 },
      { header: 'Deduction Type', key: 'deduction_type', width: 15 },
      { header: 'Statutory', key: 'is_statutory', width: 12 },
      { header: 'Prorate by Percentage', key: 'prorate_by_percentage_text', width: 20 },
      { header: 'Is Bonus', key: 'is_bonus_text', width: 12 },            
      { header: 'Is Taxable', key: 'is_taxable_text', width: 12 },            
      { header: 'Created At', key: 'created_at', width: 20 },
      { header: 'Updated At', key: 'updated_at', width: 20 }
    ];
   
    sheet.addRows(rows);
   
    // Style the header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
   
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=deduction_types.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting deduction types:', err);
    res.status(500).json({ error: 'Failed to export deduction types' });
  }
};