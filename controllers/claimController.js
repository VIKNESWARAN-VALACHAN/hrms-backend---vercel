// controllers/claimController.js
const { dbPromise } = require('../models/db');
const path = require('path');
const fs = require('fs');
const AWS = require('aws-sdk');
const multer = require('multer');

// Get all claim requests
exports.getAllClaims = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        cr.*,
        bt.name AS benefit_type,
        e.name AS employee_name,
        c.name AS company_name
      FROM claim_requests cr
      JOIN benefit_types bt ON cr.benefit_type_id = bt.id
      JOIN employees e ON cr.employee_id = e.id
      JOIN companies c ON cr.company_id = c.id
      ORDER BY cr.created_at DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching claims:', err);
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
};

// Get claim details by claim ID
exports.getClaimDetailsById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        cr.*,
        bt.name AS benefit_type_name,
        e.name AS employee_name,
        c.name AS company_name
      FROM claim_requests cr
      INNER JOIN employees e ON cr.employee_id = e.id
      INNER JOIN benefit_types bt ON cr.benefit_type_id = bt.id
      INNER JOIN companies c ON cr.company_id = c.id
      WHERE cr.id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching claim:', err);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
};

// Get claims by employee ID
exports.getClaimById = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        cr.*,
        bt.name AS benefit_type_name,
        e.name AS employee_name,
        c.name AS company_name
      FROM claim_requests cr
      INNER JOIN employees e ON cr.employee_id = e.id
      INNER JOIN benefit_types bt ON cr.benefit_type_id = bt.id
      INNER JOIN companies c ON cr.company_id = c.id
      WHERE cr.employee_id = ?
    `, [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    res.json(rows);
  } catch (err) {
    console.error('Error fetching claim:', err);
    res.status(500).json({ error: 'Failed to fetch claim' });
  }
};


exports.createClaim = async (req, res) => {
  console.log('--- Starting createClaim function ---');
  console.log('Request body:', req.body);

  const { employee_id, benefit_type_id, claim_date, amount, employee_remark } = req.body;

  // Input validation (basic)
  console.log('Step 1: Input Validation');
  if (!employee_id || !benefit_type_id || !claim_date || amount === undefined || amount === null) {
    console.log('Validation Error: Missing required claim fields.');
    return res.status(400).json({ error: 'Missing required claim fields: employee_id, benefit_type_id, claim_date, amount.' });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    console.log('Validation Error: Claim amount invalid.');
    return res.status(400).json({ error: 'Claim amount must be a positive number.' });
  }
  console.log(`Validated Inputs: Employee ID: ${employee_id}, Benefit Type ID: ${benefit_type_id}, Amount: ${parsedAmount}`);

  let company_id; // Declare company_id with let, as it will be reassigned

  try {
    console.log('Step 2: Fetching employee company_id');
    const [employeeRows] = await dbPromise.query(
      `SELECT company_id FROM employees WHERE id = ?`,
      [employee_id]
    );
    console.log('Employee company_id query result:', employeeRows);

    if (employeeRows.length === 0) {
      console.log('Error: Employee not found for ID:', employee_id);
      return res.status(404).json({ error: 'Employee not found.' });
    }

    company_id = employeeRows[0].company_id; // Assign value to the 'let' declared variable
    console.log('Fetched company_id:', company_id);

  } catch (err) {
    console.error('Error in Step 2 - fetching employee company_id:', err);
    return res.status(500).json({ error: 'Failed to retrieve employee information.' });
  }

  const module = 'claim';
  console.log('Step 3: Getting database connection and beginning transaction');
  const conn = await dbPromise.getConnection(); // Get a connection from the pool

  try {
    await conn.beginTransaction();
    console.log('Transaction started.');

    // 1. Create the claim request
    console.log('Step 4: Inserting new claim request');
    const [claimResult] = await conn.query(
      `INSERT INTO claim_requests (employee_id, benefit_type_id, claim_date, amount, employee_remark, status, current_approval_level, final_approval_level, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, 'Pending', 1, 0, ?, ?)`,
      [employee_id, benefit_type_id, claim_date, parsedAmount, employee_remark, company_id, employee_id]
    );
    const claim_id = claimResult.insertId;
    console.log(`Claim request inserted. New claim_id: ${claim_id}`);

    // 2. Get approval config
    console.log('Step 5: Fetching approval flow settings');
    const [configResult] = await conn.query(
      'SELECT final_level FROM approval_flow_settings WHERE module = ? AND company_id = ?',
      [module, company_id]
    );
    console.log('Approval config query result:', configResult);

    // Use a default final_level if no config is found
    const final_level = configResult.length > 0 ? configResult[0].final_level : 3;
    console.log('Determined final_level:', final_level);

    // 3. Get employee info (manager and superior)
    console.log('Step 6: Fetching employee manager and superior info');
    const [empResult] = await conn.query('SELECT manager_id, superior FROM employees WHERE id = ?', [employee_id]);
    const employee = empResult.length > 0 ? empResult[0] : null;
    console.log('Employee manager/superior info:', employee);

    if (!employee) {
      console.log('Error: Employee details (manager/superior) not found, rolling back.');
      throw new Error('Employee details (manager/superior) not found after initial check, this should not happen.');
    }

    // 4. Build approval list
    console.log('Step 7: Building approval list');
    const approvals = [];

    // Get HR/Superadmin list once (assuming HR/Superadmins are company-specific)
    console.log('Fetching HR/Superadmin list for company_id:', company_id);
    const [hrList] = await conn.query(
        'SELECT id, name FROM employees WHERE is_superadmin = 1 '//,//AND company_id = ?
       // [company_id]
    );
    console.log('HR/Superadmin list:', hrList);

    if (final_level >= 1) {
        if (final_level === 1) {
            console.log('Approval flow: Level 1 (HR/Superadmin only)');
            for (const hr of hrList) {
                approvals.push({ approver_id: hr.id, level: 1, approver_name: hr.name });
            }
        } else if (final_level === 2) {
            console.log('Approval flow: Level 1 (Manager) + Level 2 (HR/Superadmin)');
            if (employee.manager_id) {
                console.log('Fetching Manager info for ID:', employee.manager_id);
                const [[mgr]] = await conn.query('SELECT id, name FROM employees WHERE id = ?', [employee.manager_id]);
                if (mgr) { // Ensure manager exists
                    approvals.push({ approver_id: mgr.id, level: 1, approver_name: mgr.name });
                    console.log('Added Manager as Level 1 Approver:', mgr.name);
                } else {
                    console.log('Warning: Manager not found for ID:', employee.manager_id);
                }
            } else {
                console.log('No Manager ID found for employee.');
            }
            for (const hr of hrList) {
                approvals.push({ approver_id: hr.id, level: 2, approver_name: hr.name });
            }
            console.log('Added HR/Superadmins as Level 2 Approvers.');
        } else if (final_level === 3) {
            console.log('Approval flow: Level 1 (Superior) + Level 2 (HR/Superadmin)');
            if (employee.superior) {
                console.log('Fetching Superior info for ID:', employee.superior);
                const [[sup]] = await conn.query('SELECT id, name FROM employees WHERE id = ?', [employee.superior]);
                if (sup) { // Ensure superior exists
                    approvals.push({ approver_id: sup.id, level: 1, approver_name: sup.name });
                    console.log('Added Superior as Level 1 Approver:', sup.name);
                } else {
                    console.log('Warning: Superior not found for ID:', employee.superior);
                }
            } else {
                console.log('No Superior ID found for employee.');
            }
            for (const hr of hrList) {
                approvals.push({ approver_id: hr.id, level: 2, approver_name: hr.name });
            }
            console.log('Added HR/Superadmins as Level 2 Approvers.');
        } else if (final_level === 4) {
            console.log('Approval flow: Level 1 (Manager) + Level 2 (Superior) + Level 3 (HR/Superadmin)');
            if (employee.manager_id) {
                console.log('Fetching Manager info for ID:', employee.manager_id);
                const [[mgr]] = await conn.query('SELECT id, name FROM employees WHERE id = ?', [employee.manager_id]);
                if (mgr) { // Ensure manager exists
                    approvals.push({ approver_id: mgr.id, level: 1, approver_name: mgr.name });
                    console.log('Added Manager as Level 1 Approver:', mgr.name);
                } else {
                    console.log('Warning: Manager not found for ID:', employee.manager_id);
                }
            } else {
                console.log('No Manager ID found for employee.');
            }
            if (employee.superior) {
                console.log('Fetching Superior info for ID:', employee.superior);
                const [[sup]] = await conn.query('SELECT id, name FROM employees WHERE id = ?', [employee.superior]);
                if (sup) { // Ensure superior exists
                    approvals.push({ approver_id: sup.id, level: 2, approver_name: sup.name });
                    console.log('Added Superior as Level 2 Approver:', sup.name);
                } else {
                    console.log('Warning: Superior not found for ID:', employee.superior);
                }
            } else {
                console.log('No Superior ID found for employee.');
            }
            for (const hr of hrList) {
                approvals.push({ approver_id: hr.id, level: 3, approver_name: hr.name });
            }
            console.log('Added HR/Superadmins as Level 3 Approvers.');
        }
    }
    console.log('Final approvals list:', approvals);


    // 5. Insert claim_approvals + approval_history
    console.log('Step 8: Inserting into claim_approvals and approval_history');
    if (approvals.length === 0) {
      console.log('No approvers found for this claim. Skipping claim_approvals and approval_history inserts.');
    }
    for (const { approver_id, level, approver_name } of approvals) {
      console.log(`Inserting claim_approval for approver_id: ${approver_id}, level: ${level}`);
      await conn.query(
        // **FIX:** Removed 'employee_id' from column list
        `INSERT INTO claim_approvals (claim_id, approver_id, level)
         VALUES (?, ?, ?)`,
        // **FIX:** Removed 'employee_id' from values array
        [claim_id, approver_id, level]
      );
      console.log(`Inserted claim_approval. Now inserting approval_history for approver_id: ${approver_id}`);

      await conn.query(
        `INSERT INTO approval_history
         (module, record_id, company_id, level, approver_id, approver_name, status, remark)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending', '')`,
        [module, claim_id, company_id, level, approver_id, approver_name]
      );
      console.log(`Inserted approval_history for approver_id: ${approver_id}.`);
    }

    // 6. Update final level in claim (using claim_requests table)
    console.log('Step 9: Updating final_approval_level in claim_requests');
    const maxLevel = approvals.length > 0 ? Math.max(...approvals.map((a) => a.level)) : 0;
    console.log('Calculated maxLevel:', maxLevel);
    await conn.query(
      `UPDATE claim_requests SET final_approval_level = ? WHERE id = ?`,
      [maxLevel, claim_id]
    );
    console.log(`Updated claim_requests with final_approval_level: ${maxLevel} for claim_id: ${claim_id}`);

    // ✅ 7. Update employee_benefits.claimed
    console.log('Step 10: Updating employee_benefits.claimed amount');
    await conn.query(
      `UPDATE employee_benefits
       SET claimed = claimed + ?
       WHERE employee_id = ? AND benefit_type_id = ?`,
      [parsedAmount, employee_id, benefit_type_id]
    );
    console.log(`Updated employee_benefits: added ${parsedAmount} to claimed for employee ${employee_id}, benefit ${benefit_type_id}`);

    console.log('Step 11: Committing transaction');
    await conn.commit();
    console.log('Transaction committed successfully.');
    res.status(201).json({ message: 'Claim created with approvals and history', claim_id }); // 201 Created

  } catch (err) {
    console.error('Error during transaction, rolling back:', err);
    await conn.rollback();
    console.log('Transaction rolled back.');
    res.status(500).json({ error: 'Failed to create claim with approvals. Please try again later.' });
  } finally {
    console.log('Step 12: Releasing database connection');
    conn.release(); // Always release the connection
    console.log('Database connection released.');
    console.log('--- Finished createClaim function ---');
  }
};

// Update claim
exports.updateClaim = async (req, res) => {
  try {
    const { amount, employee_remark, admin_remark, status } = req.body;
    const claimId = req.params.id;

    // Get current claim data first to ensure we have existing values for non-editable fields
    // We also need benefit_type_id and company_id for the final SELECT JOIN
    const [currentClaimRows] = await dbPromise.query(
      'SELECT id, amount, employee_remark, admin_remark, status, benefit_type_id, company_id FROM claim_requests WHERE id = ?',
      [claimId]
    );

    if (!currentClaimRows || currentClaimRows.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    const currentClaim = currentClaimRows[0]; // Access the first element of the result array

    // Prepare update data. Only include fields that are meant to be updated.
    const updateData = {
      amount: amount !== undefined ? parseFloat(amount) : currentClaim.amount,
      employee_remark: employee_remark !== undefined ? employee_remark : currentClaim.employee_remark,
      admin_remark: admin_remark !== undefined ? admin_remark : currentClaim.admin_remark,
      status: status !== undefined ? status : currentClaim.status,
    };

    const sql = `UPDATE claim_requests SET
      amount = ?,
      employee_remark = ?,
      admin_remark = ?,
      status = ?,
      updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`;

    await dbPromise.query(sql, [
      updateData.amount,
      updateData.employee_remark,
      updateData.admin_remark,
      updateData.status,
      claimId
    ]);

    // *** FINAL CORRECTION: Use 'name' for both benefit_types and companies tables ***
    const [updatedClaimRows] = await dbPromise.query(
      `SELECT
         cr.id,
         bt.name AS benefit_type_name, -- Corrected: Use 'name' from benefit_types
         cr.amount,
         cr.approved_amount,
         cr.claim_date,
         cr.status,
         cr.employee_remark,
         cr.admin_remark,
         c.name AS company_name, -- Corrected: Use 'name' from companies
         cr.current_approval_level,
         cr.final_approval_level,
         cr.created_at
       FROM
         claim_requests cr
       JOIN
         benefit_types bt ON cr.benefit_type_id = bt.id
       JOIN
         companies c ON cr.company_id = c.id
       WHERE
         cr.id = ?`,
      [claimId]
    );

    if (!updatedClaimRows || updatedClaimRows.length === 0) {
      return res.status(404).json({ error: 'Updated claim not found after retrieval' });
    }

    res.json({ success: true, claim: updatedClaimRows[0] });
  } catch (err) {
    console.error('Error updating claim:', err);
    res.status(500).json({
      error: 'Failed to update claim',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// Delete claim
exports.deleteClaim = async (req, res) => {
  const claimId = req.params.id; // Get the ID of the claim to be deleted

  try {
    // Start a transaction to ensure atomicity (both deletions succeed or both fail)
    // This is highly recommended for operations involving multiple related tables.
    // (Assuming your dbPromise supports transactions, e.g., using mysql2/promise or similar)

    // Step 1: Delete all associated records from the 'claim_approvals' table
    await dbPromise.query('DELETE FROM claim_approvals WHERE claim_id = ?', [claimId]);
    console.log(`Deleted approval records for claim ID: ${claimId}`);

    // Step 2: Now, delete the record from the 'claim_requests' table
    const [result] = await dbPromise.query('DELETE FROM claim_requests WHERE id = ?', [claimId]);
    console.log(`Deleted claim request with ID: ${claimId}`);

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Claim not found.' });
    }

    res.json({ success: true, message: 'Claim and associated approvals deleted successfully.' });

  } catch (err) {
    console.error('Error deleting claim and its approvals:', err);
    // If using transactions, you would roll back here: await connection.rollback();
    res.status(500).json({ error: 'Failed to delete claim and its approvals.' });
  }
};

// Get all attachments for a claim
exports.getClaimAttachments = async (req, res) => {
  try {
    const [attachments] = await dbPromise.query(
      `SELECT 
        ca.id,
        ca.file_name,
        ca.file_url,
        ca.mime_type,
        ca.created_at,
        e.name AS uploaded_by_name
      FROM claim_attachments ca
      JOIN employees e ON ca.uploaded_by = e.id
      WHERE ca.claim_id = ?`,
      [req.params.id]
    );
    
    res.json(attachments);
  } catch (err) {
    console.error('Error fetching claim attachments:', err);
    res.status(500).json({ error: 'Failed to fetch claim attachments' });
  }
};

// Upload attachment
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    parts: 10, // Limit number of form parts
    files: 5, // Limit number of files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, JPEG, and PNG are allowed.'), false);
    }
  }
}).single('attachment');

exports.uploadAttachment1 = async (req, res) => {
  try {
    // Process the upload first
    await new Promise((resolve, reject) => {
      upload(req, res, (err) => {
        if (err) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return reject(new Error('File size exceeds 10MB limit'));
          }
          return reject(err);
        }
        resolve();
      });
    });

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const file = req.file;
    const { claim_id } = req.params;
    const uploaded_by = req.user.id; // From authentication middleware

    // Configure AWS S3
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    const s3Key = `claims/${claim_id}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    };

    // Upload to S3
    const uploaded = await s3.upload(uploadParams).promise();

    // Save to database
    const conn = await dbPromise.getConnection();
    await conn.query(
      `INSERT INTO claim_attachments (
        claim_id, file_name, file_url, mime_type, uploaded_by, s3_key
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [claim_id, file.originalname, uploaded.Location, file.mimetype, uploaded_by, s3Key]
    );
    conn.release();

    return res.status(201).json({
      success: true,
      file: {
        name: file.originalname,
        url: uploaded.Location,
        mime_type: file.mimetype,
        size: file.size
      }
    });

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to upload attachment',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

exports.uploadAttachment = async (req, res) => {
  // Validate request first
  if (!req.params.claim_id) {
    return res.status(400).json({ error: 'Missing claim ID' });
  }

  // Process upload with timeout
  try {
    await new Promise((resolve, reject) => {
      const uploadTimeout = setTimeout(() => {
        reject(new Error('Upload timed out (60s)'));
      }, 60000);

      upload(req, res, (err) => {
        clearTimeout(uploadTimeout);
        if (err) {
          console.error('Upload processing error:', err);
          if (err.code === 'LIMIT_FILE_SIZE') {
            return reject(new Error('File size exceeds 10MB limit'));
          }
          if (err.message.includes('Unexpected end of form')) {
            return reject(new Error('Upload was interrupted. Please try again with a stable connection.'));
          }
          return reject(err);
        }
        if (!req.file) {
          return reject(new Error('No file was uploaded'));
        }
        resolve();
      });
    });

    const file = req.file;
    const { claim_id } = req.params;
    const uploaded_by = req.user.id;

    // Validate claim_id exists
    const [claim] = await dbPromise.query('SELECT id FROM claim_requests WHERE id = ?', [claim_id]);
    if (!claim || claim.length === 0) {
      return res.status(404).json({ error: 'Claim not found' });
    }

    // Configure AWS S3
    const s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    const s3Key = `claims/${claim_id}/${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;

    const uploadParams = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: file.mimetype,
      ACL: 'private'
    };

    // Upload to S3 with error handling
    let uploaded;
    try {
      uploaded = await s3.upload(uploadParams).promise();
    } catch (s3Err) {
      console.error('S3 upload error:', s3Err);
      return res.status(500).json({ error: 'Failed to upload file to storage' });
    }

    // Save to database
    const conn = await dbPromise.getConnection();
    try {
      await conn.query(
        `INSERT INTO claim_attachments (
          claim_id, file_name, file_url, mime_type, uploaded_by, s3_key
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [claim_id, file.originalname, uploaded.Location, file.mimetype, uploaded_by, s3Key]
      );
      
      return res.status(201).json({
        success: true,
        file: {
          name: file.originalname,
          url: uploaded.Location,
          mime_type: file.mimetype,
          size: file.size
        }
      });
    } catch (dbErr) {
      console.error('Database error:', dbErr);
      // Attempt to delete the uploaded S3 file if DB insert failed
      try {
        await s3.deleteObject({
          Bucket: process.env.AWS_BUCKET_NAME,
          Key: s3Key
        }).promise();
      } catch (delErr) {
        console.error('Failed to cleanup S3 file:', delErr);
      }
      return res.status(500).json({ error: 'Failed to save file information' });
    } finally {
      conn.release();
    }

  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ 
      error: error.message || 'Failed to process file upload',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

// Download attachment
exports.downloadAttachment = async (req, res) => {
  try {
    const { id } = req.params;

    const [attachment] = await dbPromise.query(
      `SELECT 
        ca.file_name,
        ca.mime_type,
        ca.s3_key,
        e.name AS employee_name,
        cr.id AS claim_id
      FROM claim_attachments ca
      JOIN claim_requests cr ON ca.claim_id = cr.id
      JOIN employees e ON cr.employee_id = e.id
      WHERE ca.id = ?`, 
      [id]
    );

    if (attachment.length === 0) {
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const selectedAttachment = attachment[0];
    const s3 = new AWS.S3();
    
    const s3Params = {
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: selectedAttachment.s3_key
    };

    s3.getObject(s3Params, function(err, data) {
      if (err) {
        console.error('S3 download error:', err);
        return res.status(500).send(err);
      }
      
      res.setHeader('Content-disposition', `attachment; filename=${selectedAttachment.claim_id}-${selectedAttachment.file_name}`);
      res.setHeader('Content-type', selectedAttachment.mime_type);
      res.send(data.Body);
    });

  } catch (error) {
    console.error('Error in downloadAttachment:', error);
    res.status(500).json({ error: 'Error downloading attachment' });
  }
};

// Delete attachment
exports.deleteAttachment = async (req, res) => {
  const conn = await dbPromise.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;

    // 1. Get attachment info (including S3 key)
    const [attachment] = await conn.query(
      'SELECT s3_key FROM claim_attachments WHERE id = ?',
      [id]
    );

    if (attachment.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Attachment not found' });
    }

    const s3Key = attachment[0].s3_key;

    // 2. Delete from S3
    const s3 = new AWS.S3();
    await s3.deleteObject({
      Bucket: process.env.AWS_BUCKET_NAME,
      Key: s3Key
    }).promise();

    // 3. Delete from database
    await conn.query(
      'DELETE FROM claim_attachments WHERE id = ?',
      [id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Attachment deleted successfully' });

  } catch (error) {
    await conn.rollback();
    console.error('Error deleting attachment:', error);
    res.status(500).json({ error: 'Failed to delete attachment' });
  } finally {
    conn.release();
  }
};