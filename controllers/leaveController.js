// const { dbPromise } = require('../models/db');
// const AWS = require('aws-sdk');

// // Get all leave applications with filters
// const getAllLeaves = async (req, res) => {
//     try {
//         const { status, employeeId, startDate, endDate, departmentId } = req.query;

//         let query = `
//             SELECT 
//                 l.*,
//                 e.name as employee_name,
//                 c.id as company_id,
//                 c.name as company_name,
//                 d.id as department_id,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             LEFT JOIN 
//                 companies c ON e.company_id = c.id
//             WHERE 1=1
//         `;
        
//         const params = [];
        
//         if (status) {
//             query += ' AND l.status = ?';
//             params.push(status);
//         }
        
//         if (employeeId) {
//             query += ' AND l.employee_id = ?';
//             params.push(employeeId);
//         }
        
//         if (departmentId) {
//             query += ' AND e.department_id = ?';
//             params.push(departmentId);
//         }
        
//         if (startDate && endDate) {
//             query += ' AND l.start_date >= ? AND l.end_date <= ?';
//             params.push(startDate, endDate);
//         }
        
//         query += ' ORDER BY l.created_at DESC';
        
//         const [leaves] = await dbPromise.query(query, params);
//         res.json(leaves);
//     } catch (error) {
//         console.error('Error in getAllLeaves:', error);
//         res.status(500).json({ error: 'Error fetching leaves' });
//     }
// };

// const getAllLeavesByEmployeeId = async (req, res) => {
//     try {
//         const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
//         const [employee] = await dbPromise.query(
//             'SELECT id, name, manager_id, superior, role FROM employees WHERE id = ?',
//             [employeeId]
//         ); 

//         let query = `
//             SELECT 
//                 l.*,
//                 e.name as employee_name,
//                 c.id as company_id,
//                 c.name as company_name,
//                 d.id as department_id,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             LEFT JOIN 
//                 companies c ON e.company_id = c.id
//             WHERE 1=1
//         `;
        
//         const params = [];
        
//         if (status) {
//             query += ' AND l.status = ?';
//             params.push(status);
//         }
        
//         if (employeeId) {
//             query += ' AND l.employee_id = ?';    
//             params.push(employeeId);
//         }
        
//         if (employee[0].role === 'supervisor') {
//             query += ' OR (e.superior = ?)';
//             params.push(employeeId);
//         }
        
//         if (employee[0].role === 'manager') {
//             query += ' OR (e.manager_id = ? AND l.status != ?)';            
//             params.push(employeeId, 'PENDING');
//             query += ' OR (e.manager_id = ? and l.status = ? and e.superior = ?)';
//             params.push(employeeId, 'PENDING', employeeId);
//         }
        
//         if (departmentId) {
//             query += ' AND e.department_id = ?';
//             params.push(departmentId);
//         }
        
//         if (startDate && endDate) {
//             query += ' AND l.start_date >= ? AND l.end_date <= ?';
//             params.push(startDate, endDate);
//         }
        
//         query += ' ORDER BY l.created_at DESC';
        
//         const [leaves] = await dbPromise.query(query, params);
//         res.json(leaves);
//     } catch (error) {
//         console.error('Error in getAllLeaves:', error);
//         res.status(500).json({ error: 'Error fetching leaves' });
//     }
// };

// const getLeavesForCalendarByEmployeeId = async (req, res) => {
//     try {
//         const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
//         const [employee] = await dbPromise.query(
//             'SELECT id, name, manager_id, superior, role, company_id FROM employees WHERE id = ?',
//             [employeeId]
//         ); 

//         let query = `
//             SELECT 
//                 l.*,
//                 e.name as employee_name,
//                 c.id as company_id,
//                 c.name as company_name,
//                 d.id as department_id,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             LEFT JOIN 
//                 companies c ON e.company_id = c.id
//             WHERE 1=1
//         `;
        
//         const params = [];
        
//         if (departmentId) {
//             query += ' AND e.department_id = ?';
//             params.push(departmentId);
//         }
        
//         if (startDate && endDate) {
//             query += ' AND l.start_date >= ? AND l.end_date <= ?';
//             params.push(startDate, endDate);
//         }
        
//         query += ' AND l.company_id = ?';
//         params.push(employee[0].company_id);

//         query += ' ORDER BY l.created_at DESC';
        
//         const [leaves] = await dbPromise.query(query, params);
//         res.json(leaves);
//     } catch (error) {
//         console.error('Error in getAllLeaves:', error);
//         res.status(500).json({ error: 'Error fetching leaves' });
//     }
// };

// const getRecentLeaves = async (req, res) => {
//     try {
//         const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
//         let query = `
//             SELECT
//                 l.*,
//                 e.name as employee_name,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             WHERE 1=1
//         `;
        
//         const params = [];
        
//         if (status) {
//             query += ' AND l.status = ?';
//             params.push(status);
//         }
        
//         if (employeeId) {
//             query += ' AND l.employee_id = ?';
//             params.push(employeeId);
//         }
        
//         if (departmentId) {
//             query += ' AND e.department_id = ?';
//             params.push(departmentId);
//         }
        
//         if (startDate && endDate) {
//             query += ' AND l.start_date >= ? AND l.end_date <= ?';
//             params.push(startDate, endDate);
//         }
        
//         query += ' ORDER BY l.created_at DESC LIMIT 8';
        
//         const [leaves] = await dbPromise.query(query, params);
//         res.json(leaves);
//     } catch (error) {
//         console.error('Error in getAllLeaves:', error);
//         res.status(500).json({ error: 'Error fetching leaves' });
//     }
// };

// // Get leave application by ID
// const getLeaveById = async (req, res) => {
//     try {
//         const { id } = req.params;
        
//         const query = `
//             SELECT 
//                 l.*,
//                 e.name as employee_name,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name,
//                 ld.document_url,
//                 ld.document_type,
//                 ld.file_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             LEFT JOIN 
//                 leave_documents ld ON l.id = ld.leave_application_id
//             WHERE 
//                 l.id = ?
//         `;
        
//         const [leaves] = await dbPromise.query(query, [id]);
        
//         if (leaves.length === 0) {
//             return res.status(404).json({ error: 'Leave application not found' });
//         }
        
//         res.json(leaves[0]);
//     } catch (error) {
//         console.error('Error in getLeaveById:', error);
//         res.status(500).json({ error: 'Error fetching leave details' });
//     }
// };

// // Create new leave application
// const createLeave = async (req, res) => {
//     try {               
//         const {
//             employee_id,
//             leave_type_id,
//             start_date,
//             end_date,
//             reason,
//             is_half_day
//         } = req.body;

//         // Calculate duration
//         let duration = calculateBusinessDays(start_date, end_date);

//         if (is_half_day) {
//             duration = 0.5;
//         }

//         // Get leave type to check if it's unpaid leave
//         const [leaveType] = await dbPromise.query(
//             'SELECT * FROM leave_types WHERE id = ?',
//             [leave_type_id]
//         );

//         // Skip balance check for unpaid leave
//         if (leaveType[0]?.code !== 'UNPAID') {
//             // Check leave balance
//             const balanceQuery = `
//                 SELECT * FROM leave_balances 
//                 WHERE employee_id = ? 
//                 AND leave_type_id = ? 
//                 AND year = YEAR(CURRENT_DATE)
//             `;
            
//             const [balances] = await dbPromise.query(balanceQuery, [employee_id, leave_type_id]);
            
//             if (balances.length === 0 || balances[0].remaining_days < duration) {
//                 return res.status(400).json({ 
//                     error: 'Insufficient leave balance' 
//                 });
//             }
//         }

//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
            
//             const [employee] = await connection.query(
//                 'SELECT id, name, manager_id, superior, role, company_id, department_id FROM employees WHERE id = ?',
//                 [employee_id]
//             ); 

//             // Create leave application
//             const leaveQuery = `
//                 INSERT INTO leave_applications 
//                 (employee_id, leave_type_id, start_date, end_date, duration, reason, status, company_id, department_id) 
//                 VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
//             `;
            
//             const [result] = await connection.query(leaveQuery, [
//                 employee_id,
//                 leave_type_id,
//                 start_date,
//                 end_date,
//                 duration,
//                 reason,
//                 employee[0].company_id,
//                 employee[0].department_id
//             ]);

//             const leaveId = result.insertId;

//             // Handle multiple file attachments if present
//             if (req.files) {
//                 // Support both single and multiple attachments[]
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                       ? req.files['attachments[]']
//                       : [req.files['attachments[]']];
//                   } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                       ? req.files.attachments
//                       : [req.files.attachments];
//                   } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                   }
                  
//                 for (const file of attachments) {
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `leaves/${employee_id}/${leaveId}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
                    
//                     // Upload to S3
//                     const s3 = new AWS.S3({
//                         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                         region: process.env.AWS_REGION,
//                         signatureVersion: 'v4',
//                         endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                     });
//                     try {
//                         const uploadedData = await s3.upload(fileData).promise();
//                         // Save attachment reference in database
//                         const attachmentQuery = `INSERT INTO leave_documents 
//                             (
//                                 leave_application_id, 
//                                 document_type, 
//                                 file_name, 
//                                 file_path, 
//                                 file_size, 
//                                 file_type, 
//                                 uploaded_by, 
//                                 document_url
//                             ) 
//                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//                             `;
//                         await connection.query(attachmentQuery, [
//                             leaveId,
//                             file.mimetype,
//                             file.name,
//                             fileData.Key,
//                             file.size,
//                             file.mimetype,
//                             employee_id,
//                             uploadedData.Location
//                         ]);
//                     } catch (error) {
//                         console.error('S3 upload error:', error);
//                         throw new Error('Failed to upload file to S3');
//                     }
//                 }
//             }

//             // Create leave approval work flow        
//             const approvalWorkflowQuery = `
//                 INSERT INTO leave_approval_workflow 
//                 (leave_application_id, approver_id, level, status, comments) 
//                 VALUES (?, ?, 1, 'APPROVAL_REQUIRED', ?)
//             `;
            
//             if (employee[0] !== null && employee[0].manager_id !== null) {
//                 await connection.query(approvalWorkflowQuery, [
//                     leaveId,
//                     employee[0].superior,
//                     `New leave request from ${employee[0].name} needs your approval`
//                 ]);
//             }

//             await connection.commit();
//             res.status(201).json({ 
//                 message: 'Leave application created successfully',
//                 leaveId 
//             });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in createLeave:', error);
//         if (error.message.includes('Invalid file type')) {
//             return res.status(400).json({ error: error.message });
//         }
//         res.status(500).json({ error: 'Error creating leave application' });
//     }
// };

// // Approve leave application
// const approveLeave = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { approver_id, comment, approval_level } = req.body;

//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
//             // Get leave details
//             const [leaves] = await connection.query(
//                 'SELECT * FROM leave_applications WHERE id = ?',
//                 [id]
//             );

//             if (leaves.length === 0) {
//                 await connection.rollback();
//                 return res.status(404).json({ error: 'Leave application not found' });
//             }

//             const leave = leaves[0];

//             // Check if employee is an 'employee'
//             const [employeeToApprove] = await connection.query(
//                 'SELECT manager_id, superior, role FROM employees WHERE id = ?',
//                 [leave.employee_id]
//             );
            
//             if (employeeToApprove[0].role === 'employee') {
//                 // Handle first level approval
//                 if (approval_level === 'FIRST') {
//                     if (leave.status !== 'PENDING') {
//                         await connection.rollback();
//                         return res.status(400).json({ 
//                             error: 'Leave application is not in pending status' 
//                         });
//                     }
    
//                     // Update leave application for first approval
//                     await connection.query(
//                         `UPDATE leave_applications 
//                         SET status = 'FIRST_APPROVED', 
//                             first_approver_id = ?, 
//                             first_approval_date = CURRENT_TIMESTAMP, 
//                             first_approval_comment = ? 
//                         WHERE id = ?`,
//                         [approver_id, comment, id]
//                     );
    
//                     // Create approval history
//                     await connection.query(
//                         `INSERT INTO leave_history 
//                         (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
//                         VALUES (?, 'FIRST_APPROVED', ?, 'PENDING', 'FIRST_APPROVED', ?)`,
//                         [id, approver_id, comment]
//                     );
    
//                     // Create leave approval work flow            
//                     const [employee] = await connection.query(
//                         'SELECT name, manager_id, superior FROM employees WHERE id = ?',
//                         [leave.employee_id]
//                     );     
                    
//                     const approvalWorkflowQuery = `
//                         INSERT INTO leave_approval_workflow 
//                         (leave_application_id, approver_id, level, status, comments) 
//                         VALUES (?, ?, 2, 'FIRST_APPROVED', ?)
//                     `;
                    
//                     await connection.query(approvalWorkflowQuery, [
//                         id,
//                         employee[0].superior,
//                         `Leave request from ${employee[0].name} first approval and need your final approval`
//                     ]);
    
//                     await connection.commit();
//                     return res.json({ message: 'Leave application first approval completed successfully' });
//                 }
                
//                 // Handle final approval
//                 if (approval_level === 'FINAL') {
//                     if (leave.status !== 'FIRST_APPROVED') {
//                         await connection.rollback();
//                         return res.status(400).json({ 
//                             error: 'Leave application must be first approved before final approval' 
//                         });
//                     }
    
//                     // Update leave application for final approval
//                     await connection.query(
//                         `UPDATE leave_applications 
//                         SET status = 'APPROVED', 
//                             second_approver_id = ?, 
//                             second_approval_date = CURRENT_TIMESTAMP, 
//                             second_approval_comment = ? 
//                         WHERE id = ?`,
//                         [approver_id, comment, id]
//                     );
    
//                     // Create approval history
//                     await connection.query(
//                         `INSERT INTO leave_history 
//                         (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
//                         VALUES (?, 'APPROVED', ?, 'FIRST_APPROVED', 'APPROVED', ?)`,
//                         [id, approver_id, comment]
//                     );
    
//                     // Update leave balance
//                     await connection.query(
//                         `UPDATE leave_balances 
//                         SET used_days = used_days + ?, 
//                             remaining_days = remaining_days - ?,
//                             accrual_remaining_days = accrual_remaining_days - ?
//                         WHERE employee_id = ? 
//                         AND leave_type_id = ? 
//                         AND year = YEAR(CURRENT_DATE)`,
//                         [leave.duration, leave.duration, leave.duration, leave.employee_id, leave.leave_type_id]
//                     );
    
//                     // Create leave approval work flow         
//                     const [employee] = await connection.query(
//                         'SELECT name, manager_id, superior FROM employees WHERE id = ?',
//                         [leave.employee_id]
//                     );

//                     const approvalWorkflowQuery = `
//                         INSERT INTO leave_approval_workflow 
//                         (leave_application_id, approver_id, level, status, comments) 
//                         VALUES (?, ?, 0, 'APPROVED', ?)
//                     `;
                    
//                     await connection.query(approvalWorkflowQuery, [
//                         id,
//                         employee[0].manager_id,
//                         `Leave request from ${employee[0].name} approved`
//                     ]);
    
//                     await connection.commit();
//                     return res.json({ message: 'Leave application finally approved successfully' });
//                 }
//             }

//             if (employeeToApprove[0].role === 'supervisor' || employeeToApprove[0].role === 'manager' || employeeToApprove[0].role === 'admin') {
//                 // Handle first level approval
//                 if (approval_level === 'FIRST') {
//                     if (leave.status !== 'PENDING') {
//                         await connection.rollback();
//                         return res.status(400).json({ 
//                             error: 'Leave application is not in pending status' 
//                         });
//                     }

//                     // Update leave application for first approval
//                     await connection.query(
//                         `UPDATE leave_applications 
//                         SET status = 'APPROVED', 
//                             first_approver_id = ?, 
//                             first_approval_date = CURRENT_TIMESTAMP, 
//                             first_approval_comment = ? 
//                         WHERE id = ?`,
//                         [approver_id, comment, id]
//                     );

//                     // Create approval history
//                     await connection.query(
//                         `INSERT INTO leave_history 
//                         (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
//                         VALUES (?, 'APPROVED', ?, 'PENDING', 'APPROVED', ?)`,
//                         [id, approver_id, comment]
//                     );

//                     // Create leave approval work flow            
//                     const [employee] = await connection.query(
//                         'SELECT name, manager_id, superior FROM employees WHERE id = ?',
//                         [leave.employee_id]
//                     );
                    
//                     const approvalWorkflowQuery = `
//                         INSERT INTO leave_approval_workflow 
//                         (leave_application_id, approver_id, level, status, comments) 
//                         VALUES (?, ?, 0, 'APPROVED', ?)
//                     `;
                    
//                     await connection.query(approvalWorkflowQuery, [
//                         id,
//                         approver_id,
//                         `Leave request from ${employee[0].name} approved`
//                     ]);

//                     await connection.commit();
//                     return res.json({ message: 'Leave application approved successfully' });
//                 }
//             }

//             await connection.rollback();
//             return res.status(400).json({ error: 'Invalid approval level' });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in approveLeave:', error);
//         res.status(500).json({ error: 'Error approving leave application' });
//     }
// };

// // Reject leave application
// const rejectLeave = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { approver_id, reason, approval_level } = req.body;

//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
//             // Get leave details
//             const [leaves] = await connection.query(
//                 'SELECT * FROM leave_applications WHERE id = ?',
//                 [id]
//             );

//             if (leaves.length === 0) {
//                 await connection.rollback();
//                 return res.status(404).json({ error: 'Leave application not found' });
//             }

//             const leave = leaves[0];

//             // Handle first level rejection
//             if (approval_level === 'FIRST') {
//                 if (leave.status !== 'PENDING') {
//                     await connection.rollback();
//                     return res.status(400).json({ 
//                         error: 'Leave application is not in pending status' 
//                     });
//                 }

//                 // Update leave application
//                 await connection.query(
//                     `UPDATE leave_applications 
//                     SET status = 'REJECTED', 
//                         first_approver_id = ?, 
//                         rejection_reason = ?,
//                         rejection_date = CURRENT_TIMESTAMP
//                     WHERE id = ?`,
//                     [approver_id, reason, id]
//                 );
    
//                 // Create rejection history
//                 await connection.query(
//                     `INSERT INTO leave_history 
//                     (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
//                     VALUES (?, 'REJECTED', ?, 'PENDING', 'REJECTED', ?)`,
//                     [id, approver_id, reason]
//                 );
    
//                 // Create leave approval work flow            
//                 const [employee] = await connection.query(
//                     'SELECT name, manager_id, superior FROM employees WHERE id = ?',
//                     [leave.employee_id]
//                 );        
                
//                 const approvalWorkflowQuery = `
//                     INSERT INTO leave_approval_workflow 
//                     (leave_application_id, approver_id, level, status, comments) 
//                     VALUES (?, ?, 0, 'REJECTED', ?)
//                 `;
                
//                 await connection.query(approvalWorkflowQuery, [
//                     leave.id,
//                     employee[0].superior,
//                     `Leave request from ${employee[0].name} rejected`
//                 ]);
//             }

//             // Handle final rejection
//             if (approval_level === 'FINAL') {
//                 if (leave.status !== 'FIRST_APPROVED') {
//                     await connection.rollback();
//                     return res.status(400).json({ 
//                         error: 'Leave application must be first approved before final approval' 
//                     });
//                 }

//                 // Update leave application
//                 await connection.query(
//                     `UPDATE leave_applications 
//                     SET status = 'REJECTED', 
//                         second_approver_id = ?, 
//                         rejection_reason = ?,
//                         rejection_date = CURRENT_TIMESTAMP 
//                     WHERE id = ?`,
//                     [approver_id, reason, id]
//                 );
    
//                 // Create rejection history
//                 await connection.query(
//                     `INSERT INTO leave_history 
//                     (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
//                     VALUES (?, 'REJECTED', ?, 'PENDING', 'REJECTED', ?)`,
//                     [id, approver_id, reason]
//                 );
    
//                 // Create leave approval work flow                   
//                 const [employee] = await connection.query(
//                     'SELECT name, manager_id FROM employees WHERE id = ?',
//                     [leave.employee_id]
//                 );         
                
//                 const approvalWorkflowQuery = `
//                     INSERT INTO leave_approval_workflow 
//                     (leave_application_id, approver_id, level, status, comments) 
//                     VALUES (?, ?, 0, 'REJECTED', ?)
//                 `;
                
//                 await connection.query(approvalWorkflowQuery, [
//                     leave.id,
//                     employee[0].manager_id,
//                     `Leave request from ${employee[0].name} rejected`
//                 ]);
//             }

//             await connection.commit();
//             res.json({ message: 'Leave application rejected successfully' });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in rejectLeave:', error);
//         res.status(500).json({ error: 'Error rejecting leave application' });
//     }
// };

// // Get leave balance
// const getLeaveBalance = async (req, res) => {
//     try {
//         const { employeeId, year } = req.query;
//         const currentYear = year || new Date().getFullYear();

//         const query = `
//             SELECT 
//                 lb.*,
//                 lt.leave_type_name,
//                 lt.is_total,
//                 lt.total_type,
//                 lt.is_divident
//             FROM 
//                 leave_balances lb
//             JOIN 
//                 leave_types lt ON lb.leave_type_id = lt.id
//             WHERE 
//                 lb.employee_id = ? 
//                 AND lb.year = ?
//         `;

//         const [balances] = await dbPromise.query(query, [employeeId, currentYear]);
//         res.json(balances);
//     } catch (error) {
//         console.error('Error in getLeaveBalance:', error);
//         res.status(500).json({ error: 'Error fetching leave balance' });
//     }
// };

// // Get leave calendar
// const getLeaveCalendar = async (req, res) => {
//     try {
//         const { startDate, endDate, departmentId } = req.query;

//         const query = `
//             SELECT 
//                 lce.*,
//                 e.name as employee_name,
//                 d.department_name,
//                 la.leave_type_id,
//                 lt.leave_type_name
//             FROM 
//                 leave_calendar_events lce
//             JOIN 
//                 leave_applications la ON lce.leave_application_id = la.id
//             JOIN 
//                 employees e ON la.employee_id = e.id
//             JOIN 
//                 departments d ON e.department_id = d.id
//             JOIN 
//                 leave_types lt ON la.leave_type_id = lt.id
//             WHERE 
//                 lce.event_date BETWEEN ? AND ?
//                 ${departmentId ? 'AND e.department_id = ?' : ''}
//         `;

//         const params = [startDate, endDate];
//         if (departmentId) {
//             params.push(departmentId);
//         }

//         const [events] = await dbPromise.query(query, params);
//         res.json(events);
//     } catch (error) {
//         console.error('Error in getLeaveCalendar:', error);
//         res.status(500).json({ error: 'Error fetching calendar events' });
//     }
// };

// // Get leave notifications
// const getLeaveNotifications = async (req, res) => {
//     try {
//         const { recipientId, isRead } = req.query;

//         const query = `
//             SELECT 
//                 ln.*,
//                 la.leave_type_id,
//                 lt.leave_type_name,
//                 e.name as employee_name
//             FROM 
//                 leave_notifications ln
//             JOIN 
//                 leave_applications la ON ln.leave_application_id = la.id
//             JOIN 
//                 leave_types lt ON la.leave_type_id = lt.id
//             JOIN 
//                 employees e ON la.employee_id = e.id
//             WHERE 
//                 ln.recipient_id = ?
//                 ${isRead ? 'AND ln.is_read = ?' : ''}
//             ORDER BY 
//                 ln.created_at DESC
//         `;

//         const params = [recipientId];
//         if (isRead) {
//             params.push(isRead === 'true');
//         }

//         const [notifications] = await dbPromise.query(query, params);
//         res.json(notifications);
//     } catch (error) {
//         console.error('Error in getLeaveNotifications:', error);
//         res.status(500).json({ error: 'Error fetching notifications' });
//     }
// };

// // Update notification status
// const updateNotificationStatus = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { isRead } = req.body;

//         await dbPromise.query(
//             `UPDATE leave_notifications 
//             SET is_read = ?, 
//                 read_at = CURRENT_TIMESTAMP 
//             WHERE id = ?`,
//             [isRead, id]
//         );

//         res.json({ message: 'Notification status updated successfully' });
//     } catch (error) {
//         console.error('Error in updateNotificationStatus:', error);
//         res.status(500).json({ error: 'Error updating notification status' });
//     }
// };

// // Upload leave documents
// const uploadLeaveDocuments = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { documents } = req.body;

//         const query = `
//             INSERT INTO leave_documents 
//             (leave_application_id, document_url, document_type) 
//             VALUES ?
//         `;

//         const values = documents.map(doc => [id, doc.url, doc.type]);
//         await dbPromise.query(query, [values]);

//         res.json({ message: 'Documents uploaded successfully' });
//     } catch (error) {
//         console.error('Error in uploadLeaveDocuments:', error);
//         res.status(500).json({ error: 'Error uploading documents' });
//     }
// };

// // Get leave documents
// const getLeaveDocuments = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const [documents] = await dbPromise.query(
//             'SELECT * FROM leave_documents WHERE leave_application_id = ?',
//             [id]
//         );

//         res.json(documents);
//     } catch (error) {
//         console.error('Error in getLeaveDocuments:', error);
//         res.status(500).json({ error: 'Error fetching documents' });
//     }
// };

// // Get all leave types
// const getAllLeaveTypes = async (req, res) => {
//     try {
//         const query = `
//             SELECT 
//                 lt.*,
//                 c.name as company_name,
//                 c.registration_number,
//                 COUNT(DISTINCT la.id) as total_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications
//             FROM 
//                 leave_types lt
//             LEFT JOIN 
//                 leave_applications la ON lt.id = la.leave_type_id
//             LEFT JOIN 
//                 companies c ON lt.company_id = c.id
//             GROUP BY 
//                 lt.id
//             ORDER BY 
//                 lt.id
//         `;

//         const [leaveTypes] = await dbPromise.query(query);
//         res.json(leaveTypes);
//     } catch (error) {
//         console.error('Error in getAllLeaveTypes:', error);
//         res.status(500).json({ error: 'Error fetching leave types' });
//     }
// };

// // Get leave type by ID
// const getLeaveTypeById = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const query = `
//             SELECT 
//                 lt.*,
//                 COUNT(DISTINCT la.id) as total_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications,
//                 COUNT(DISTINCT lb.id) as total_balances
//             FROM 
//                 leave_types lt
//             LEFT JOIN 
//                 leave_applications la ON lt.id = la.leave_type_id
//             LEFT JOIN 
//                 leave_balances lb ON lt.id = lb.leave_type_id
//             WHERE 
//                 lt.id = ?
//             GROUP BY 
//                 lt.id
//         `;

//         const [leaveTypes] = await dbPromise.query(query, [id]);

//         if (leaveTypes.length === 0) {
//             return res.status(404).json({ error: 'Leave type not found' });
//         }

//         res.json(leaveTypes[0]);
//     } catch (error) {
//         console.error('Error in getLeaveTypeById:', error);
//         res.status(500).json({ error: 'Error fetching leave type details' });
//     }
// };

// // Get leave types by company ID
// const getLeaveTypesByCompanyId = async (req, res) => {
//     try {
//         const { companyId } = req.params;

//         const query = `
//             SELECT 
//                 lt.*,
//                 c.name as company_name,
//                 c.registration_number
//             FROM 
//                 leave_types lt
//             LEFT JOIN 
//                 companies c ON lt.company_id = c.id
//             WHERE 
//                 lt.company_id = ?
//         `;

//         const [leaveTypes] = await dbPromise.query(query, [companyId]);
//         res.json(leaveTypes);
//     } catch (error) {
//         console.error('Error in getLeaveTypesByCompanyId:', error);
//         res.status(500).json({ error: 'Error fetching leave types for company' });
//     }
// };

// const getLeaveTypesByEmployeeId = async (req, res) => {
//     try {
//         const { employeeId } = req.query;
//         const [employee] = await dbPromise.query(
//             'SELECT id, name, manager_id, superior, role, company_id FROM employees WHERE id = ?',
//             [employeeId]
//         ); 

//         const query = `
//             SELECT 
//                 lt.*,
//                 c.name as company_name,
//                 c.registration_number,
//                 COUNT(DISTINCT la.id) as total_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications
//             FROM 
//                 leave_types lt
//             LEFT JOIN 
//                 leave_applications la ON lt.id = la.leave_type_id
//             LEFT JOIN 
//                 companies c ON lt.company_id = c.id
//             WHERE 
//                 lt.company_id = ?
//             GROUP BY 
//                 lt.id
//             ORDER BY 
//                 lt.id
//         `;

//         const [leaveTypes] = await dbPromise.query(query, [employee[0].company_id]);

//         if (leaveTypes.length === 0) {
//             return res.status(404).json({ error: 'Leave type not found' });
//         }

//         res.json(leaveTypes);
//     } catch (error) {
//         console.error('Error in getLeaveTypeById:', error);
//         res.status(500).json({ error: 'Error fetching leave type details' });
//     }
// };

// // Create new leave type
// const createLeaveType = async (req, res) => {
//     try {
//         const {
//             leave_type_name,
//             code,
//             description,
//             max_days,
//             requires_approval,
//             requires_documentation,
//             is_active,
//             company_id,
//             is_total,
//             total_type,
//             is_divident, 
//             increment_days, 
//             max_increment_days,
//             carry_forward_days
//         } = req.body;

//         console.log("req.body", req.body);
//         console.log("leave_type_name", leave_type_name);

//         // Validate required fields
//         if (!leave_type_name) {
//             return res.status(400).json({
//                 error: 'Leave type name is required'
//             });
//         }

//         const query = `
//             INSERT INTO leave_types (
//                 leave_type_name,
//                 code,
//                 description,
//                 max_days,
//                 requires_approval,
//                 requires_documentation,
//                 is_active,
//                 company_id,
//                 is_total,
//                 total_type,
//                 is_divident, 
//                 increment_days, 
//                 max_increment_days,
//                 carry_forward_days,
//                 created_at,
//                 updated_at
//             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
//         `;

        

//         const [result] = await dbPromise.query(query, [
//             leave_type_name,
//             code,
//             description,
//             max_days,
//             requires_approval,
//             requires_documentation,
//             is_active,
//             company_id,
//             is_total,
//             total_type,
//             is_divident, 
//             increment_days, 
//             max_increment_days,
//             carry_forward_days
//         ]);

//         res.status(201).json({
//             message: 'Leave type created successfully',
//             leaveTypeId: result.insertId
//         });
//     } catch (error) {
//         console.error('Error in createLeaveType:', error);
//         res.status(500).json({ error: 'Error creating leave type' });
//     }
// };

// // Bulk create leave types
// const bulkCreateLeaveTypes = async (req, res) => {
//     try {
//         const { leaveTypes } = req.body;
        
//         if (!Array.isArray(leaveTypes) || leaveTypes.length === 0) {
//             return res.status(400).json({ error: 'Invalid input: leaveTypes must be a non-empty array' });
//         }
        
//         const results = {
//             successful: [],
//             failed: []
//         };
        
//         const query = `
//             INSERT INTO leave_types (
//                 leave_type_name,
//                 code,
//                 description,
//                 max_days,
//                 requires_approval,
//                 requires_documentation,
//                 is_active,
//                 company_id,
//                 created_at,
//                 updated_at
//             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
//         `;
        
//         for (const leaveType of leaveTypes) {
//             const { 
//                 leave_type_name,
//                 code,
//                 description,
//                 max_days,
//                 requires_approval,
//                 requires_documentation,
//                 is_active,
//                 company_id
//             } = leaveType;
            
//             // Validate required fields
//             if (!leave_type_name || max_days == null) {
//                 results.failed.push({ 
//                     leave_type_name: leave_type_name || 'Unknown', 
//                     error: 'Leave type name and default days are required' 
//                 });
//                 continue;
//             }
            
//             try {
//                 const [result] = await dbPromise.query(query, [
//                     leave_type_name,
//                     code || leave_type_name.substring(0, 3).toUpperCase(),
//                     description || null,
//                     max_days,
//                     requires_approval !== undefined ? requires_approval : true,
//                     requires_documentation !== undefined ? requires_documentation : false,
//                     is_active !== undefined ? is_active : true,
//                     company_id
//                 ]);
                
//                 results.successful.push({
//                     id: result.insertId,
//                     leave_type_name
//                 });
//             } catch (error) {
//                 console.error(`Error creating leave type ${leave_type_name}:`, error);
//                 results.failed.push({ 
//                     leave_type_name, 
//                     error: error.message || 'Database error' 
//                 });
//             }
//         }
        
//         res.status(201).json({
//             message: 'Bulk creation completed',
//             results: {
//                 successCount: results.successful.length,
//                 failureCount: results.failed.length,
//                 successful: results.successful,
//                 failed: results.failed
//             }
//         });
//     } catch (error) {
//         console.error('Error in bulkCreateLeaveTypes:', error);
//         res.status(500).json({ error: 'Error processing bulk creation' });
//     }
// };

// // Update leave type
// const updateLeaveType = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             leave_type_name,
//             code,
//             description,
//             max_days,
//             requires_approval,
//             requires_documentation,
//             is_active,
//             company_id,
//             is_total,
//             total_type,
//             is_divident, 
//             increment_days, 
//             max_increment_days,
//             carry_forward_days
//         } = req.body;

//         // Check if leave type exists
//         const [existing] = await dbPromise.query(
//             'SELECT id FROM leave_types WHERE id = ?',
//             [id]
//         );

//         if (existing.length === 0) {
//             return res.status(404).json({ error: 'Leave type not found' });
//         }

//         const query = `
//             UPDATE leave_types 
//             SET 
//                 leave_type_name = ?,
//                 code = ?,
//                 description = ?,
//                 max_days = ?,
//                 requires_approval = ?,
//                 requires_documentation = ?,
//                 is_active = ?,
//                 company_id = ?,
//                 is_total = ?,
//                 total_type = ?,
//                 is_divident = ?,
//                 increment_days = ?,
//                 max_increment_days = ?,
//                 carry_forward_days = ?,
//                 created_at = CURRENT_TIMESTAMP,
//                 updated_at = CURRENT_TIMESTAMP
//             WHERE id = ?
//         `;

//         await dbPromise.query(query, [
//             leave_type_name,
//             code,
//             description,
//             max_days,
//             requires_approval,
//             requires_documentation,
//             is_active,
//             company_id,
//             is_total,
//             total_type,
//             is_divident, 
//             increment_days, 
//             max_increment_days,
//             carry_forward_days,
//             id
//         ]);

//         res.json({ message: 'Leave type updated successfully' });
//     } catch (error) {
//         console.error('Error in updateLeaveType:', error);
//         res.status(500).json({ error: 'Error updating leave type' });
//     }
// };

// const bulkUpdateLeaveTypes = async (req, res) => {
//     try {
//         const { leaveTypes } = req.body;
        
//         if (!Array.isArray(leaveTypes) || leaveTypes.length === 0) {
//             return res.status(400).json({ error: 'Invalid input: leaveTypes must be a non-empty array' });
//         }
        
//         const results = {
//             successful: [],
//             failed: []
//         };
        
//         const query = `
//             UPDATE leave_types 
//             SET 
//                 leave_type_name = ?,
//                 code = ?,
//                 description = ?,
//                 max_days = ?,
//                 requires_approval = ?,
//                 requires_documentation = ?,
//                 is_active = ?,
//                 company_id = ?,
//                 updated_at = CURRENT_TIMESTAMP
//             WHERE id = ?
//         `;
        
//         for (const leaveType of leaveTypes) {
//             const { 
//                 id, 
//                 leave_type_name,
//                 code,
//                 description,
//                 max_days,
//                 requires_approval,
//                 requires_documentation,
//                 is_active,
//                 company_id
//             } = leaveType;
            
//             if (!id) {
//                 results.failed.push({ id: null, error: 'Missing leave type ID' });
//                 continue;
//             }
            
//             try {
//                 // Check if leave type exists
//                 const [existing] = await dbPromise.query(
//                     'SELECT id FROM leave_types WHERE id = ?',
//                     [id]
//                 );
                
//                 if (existing.length === 0) {
//                     results.failed.push({ id, error: 'Leave type not found' });
//                     continue;
//                 }
                
//                 await dbPromise.query(query, [
//                     leave_type_name,
//                     code,
//                     description,
//                     max_days,
//                     requires_approval,
//                     requires_documentation,
//                     is_active,
//                     company_id,
//                     id
//                 ]);
                
//                 results.successful.push(id);
//             } catch (error) {
//                 console.error(`Error updating leave type ${id}:`, error);
//                 results.failed.push({ id, error: error.message });
//             }
//         }
        
//         res.json({
//             message: 'Bulk update completed',
//             results: {
//                 successCount: results.successful.length,
//                 failureCount: results.failed.length,
//                 successful: results.successful,
//                 failed: results.failed
//             }
//         });
//     } catch (error) {
//         console.error('Error in bulkUpdateLeaveTypes:', error);
//         res.status(500).json({ error: 'Error processing bulk update' });
//     }
// };

// // Delete leave type
// const deleteLeaveType = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Check if leave type exists
//         const [existing] = await dbPromise.query(
//             'SELECT id FROM leave_types WHERE id = ?',
//             [id]
//         );

//         if (existing.length === 0) {
//             return res.status(404).json({ error: 'Leave type not found' });
//         }

//         // Check if leave type is in use
//         const [inUse] = await dbPromise.query(
//             `SELECT 
//                 (SELECT COUNT(*) FROM leave_applications WHERE leave_type_id = ?) as applications,
//                 (SELECT COUNT(*) FROM leave_balances WHERE leave_type_id = ?) as balances
//             `,
//             [id, id]
//         );

//         if (inUse[0].applications > 0 || inUse[0].balances > 0) {
//             return res.status(400).json({
//                 error: 'Cannot delete leave type that is in use'
//             });
//         }

//         await dbPromise.query('DELETE FROM leave_types WHERE id = ?', [id]);

//         res.json({ message: 'Leave type deleted successfully' });
//     } catch (error) {
//         console.error('Error in deleteLeaveType:', error);
//         res.status(500).json({ error: 'Error deleting leave type' });
//     }
// };

// // Get leave type statistics
// const getLeaveTypeStats = async (req, res) => {
//     try {
//         const { year } = req.query;
//         const currentYear = year || new Date().getFullYear();

//         const query = `
//             SELECT 
//                 lt.id,
//                 lt.leave_type_name,
//                 COUNT(DISTINCT la.id) as total_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'REJECTED' THEN la.id END) as rejected_applications,
//                 COUNT(DISTINCT CASE WHEN la.status = 'PENDING' THEN la.id END) as pending_applications,
//                 SUM(CASE WHEN la.status = 'APPROVED' THEN la.duration ELSE 0 END) as total_days_approved,
//                 COUNT(DISTINCT la.employee_id) as unique_employees
//             FROM 
//                 leave_types lt
//             LEFT JOIN 
//                 leave_applications la ON lt.id = la.leave_type_id
//                 AND YEAR(la.created_at) = ?
//             GROUP BY 
//                 lt.id, lt.leave_type_name
//             ORDER BY 
//                 total_applications DESC
//         `;

//         const [stats] = await dbPromise.query(query, [currentYear]);
//         res.json(stats);
//     } catch (error) {
//         console.error('Error in getLeaveTypeStats:', error);
//         res.status(500).json({ error: 'Error fetching leave type statistics' });
//     }
// };

// const downloadAttachment = async (req, res) => {
//     try {
//         const { id } = req.params;

//         const [document] = await dbPromise.query(
//             `SELECT 
//                 l.employee_id,
//                 ld.leave_application_id,
//                 e.name as employee_name,
//                 d.department_name,
//                 lt.leave_type_name,
//                 a1.name as first_approver_name,
//                 a2.name as second_approver_name,
//                 ld.document_url,
//                 ld.document_type,
//                 ld.file_name
//             FROM 
//                 leave_applications l
//             LEFT JOIN 
//                 employees e ON l.employee_id = e.id
//             LEFT JOIN 
//                 departments d ON e.department_id = d.id
//             LEFT JOIN 
//                 leave_types lt ON l.leave_type_id = lt.id
//             LEFT JOIN 
//                 employees a1 ON l.first_approver_id = a1.id
//             LEFT JOIN 
//                 employees a2 ON l.second_approver_id = a2.id
//             LEFT JOIN 
//                 leave_documents ld ON l.id = ld.leave_application_id
//             WHERE ld.leave_application_id = ?`, 
//             [id]
//         );

//         if (document.length === 0) {
//             return res.status(404).json({ error: 'No attachment found' });
//         }       

//         const selectedDocument = document[0];
//         const s3 = new AWS.S3();
//         const key = `leaves/${selectedDocument.employee_id}/${selectedDocument.leave_application_id}/${selectedDocument.file_name}`;
//         const s3Params = {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: key
//         };
//         s3.getObject(s3Params, function(err, data) {
//             if (err === null) {
//                 res.setHeader('Content-disposition', `attachment; filename=${selectedDocument.leave_application_id}-${selectedDocument.file_name}`)
//                 res.setHeader('Content-type', selectedDocument.document_type)
//                 res.send(data.Body);
//             } else {
//                 res.status(500).send(err);
//             }
//         });  
//     } catch (error) {
//         console.error('Error in downloadAttachment:', error);
//         res.status(500).json({ error: 'Error in downloadAttachment: ' + error });
//     }
// };

// // Generate sample leave applications
// const generateSampleLeaves = async (req, res) => {
//     try {
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
//             // Get all employee IDs
//             const [employees] = await connection.query('SELECT id FROM employees');
//             const employeeIds = employees.map(emp => emp.id);

//             // Get all leave type IDs
//             const [leaveTypes] = await connection.query('SELECT id FROM leave_types');
//             const leaveTypeIds = leaveTypes.map(lt => lt.id);

//             // Generate 100 sample leave applications
//             const leaveApplications = [];
//             for (let i = 0; i < 100; i++) {
//                 const employeeId = employeeIds[Math.floor(Math.random() * employeeIds.length)];
//                 const leaveTypeId = leaveTypeIds[Math.floor(Math.random() * leaveTypeIds.length)];
//                 const startDate = new Date();
//                 startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 365));
//                 const duration = Math.floor(Math.random() * 14) + 1;
//                 const endDate = new Date(startDate);
//                 endDate.setDate(endDate.getDate() + duration - 1);

//                 const reasons = [
//                     'Family vacation',
//                     'Medical appointment',
//                     'Personal emergency',
//                     'Educational purposes',
//                     'Family event'
//                 ];
//                 const reason = reasons[Math.floor(Math.random() * reasons.length)];

//                 const statuses = ['PENDING', 'APPROVED', 'REJECTED'];
//                 const status = statuses[Math.floor(Math.random() * statuses.length)];

//                 const approverId = employeeIds[Math.floor(Math.random() * employeeIds.length)];
//                 const createdDate = new Date();
//                 createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 30));

//                 leaveApplications.push([
//                     employeeId,
//                     leaveTypeId,
//                     startDate,
//                     endDate,
//                     duration,
//                     reason,
//                     status,
//                     status !== 'PENDING' ? approverId : null,
//                     status !== 'PENDING' ? new Date() : null,
//                     status === 'APPROVED' ? 'Approved as requested' : 
//                     status === 'REJECTED' ? 'Rejected due to insufficient coverage' : null,
//                     status === 'REJECTED' ? 'Insufficient team coverage' : null,
//                     createdDate
//                 ]);
//             }

//             // Insert leave applications
//             const leaveQuery = `
//                 INSERT INTO leave_applications 
//                 (employee_id, leave_type_id, start_date, end_date, duration, reason, 
//                 status, approver_id, approval_date, approval_comment, rejection_reason, created_at)
//                 VALUES ?
//             `;
//             await connection.query(leaveQuery, [leaveApplications]);

//             await connection.commit();
//             res.status(201).json({ 
//                 message: 'Sample leave applications generated successfully',
//                 count: leaveApplications.length
//             });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in generateSampleLeaves:', error);
//         res.status(500).json({ error: 'Error generating sample leave applications' });
//     }
// };

// // Update leave application (for PENDING or FIRST_APPROVED status)
// const updateLeave = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             leave_type_id,
//             start_date,
//             end_date,
//             reason,
//             is_half_day
//         } = req.body;

//         // Get the leave application
//         const [leaves] = await dbPromise.query('SELECT * FROM leave_applications WHERE id = ?', [id]);
//         if (leaves.length === 0) {
//             return res.status(404).json({ error: 'Leave application not found' });
//         }
//         const leave = leaves[0];
//         if (!(leave.status === 'PENDING' || leave.status === 'FIRST_APPROVED')) {
//             return res.status(400).json({ error: 'Only pending or first approved leave requests can be updated' });
//         }

//         // Calculate new duration
//         let duration = calculateBusinessDays(start_date, end_date);

//         if (is_half_day) {
//             duration = 0.5;
//         }

//         // Get leave type to check if it's unpaid leave
//         const [leaveType] = await dbPromise.query(
//             'SELECT * FROM leave_types WHERE id = ?',
//             [leave_type_id]
//         );

//         // Skip balance check for unpaid leave
//         if (leaveType[0]?.code !== 'UNPAID') {
//             // Check leave balance
//             const balanceQuery = `
//                 SELECT * FROM leave_balances 
//                 WHERE employee_id = ? 
//                 AND leave_type_id = ? 
//                 AND year = YEAR(CURRENT_DATE)
//             `;
//             const [balances] = await dbPromise.query(balanceQuery, [leave.employee_id, leave_type_id]);
//             if (balances.length === 0 || balances[0].remaining_days + leave.duration < duration) {
//                 // Add back the old duration before checking
//                 return res.status(400).json({ error: 'Insufficient leave balance for update' });
//             }
//         }

//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         try {
//             // Update leave application
//             const updateQuery = `
//                 UPDATE leave_applications 
//                 SET leave_type_id = ?, start_date = ?, end_date = ?, duration = ?, reason = ?
//                 WHERE id = ?
//             `;
//             await connection.query(updateQuery, [leave_type_id, start_date, end_date, duration, reason, id]);

//             // Handle file attachment if present
//             if (req.files) {
//                 // Support both single and multiple attachments[]
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                       ? req.files['attachments[]']
//                       : [req.files['attachments[]']];
//                   } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                       ? req.files.attachments
//                       : [req.files.attachments];
//                   } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                   }
                
//                   await dbPromise.query(
//                     'DELETE FROM leave_documents WHERE leave_application_id = ?',
//                     [id]
//                 );   

//                 for (const file of attachments) {
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `leaves/${leave.employee_id}/${id}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
//                     const s3 = new AWS.S3({
//                         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                         region: process.env.AWS_REGION,
//                         signatureVersion: 'v4',
//                         endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                     });
//                     try {
//                         const uploadedData = await s3.upload(fileData).promise();
//                         // Save attachment reference in database
//                         const attachmentQuery = `INSERT INTO leave_documents 
//                             (leave_application_id, document_type, file_name, file_path, file_size, file_type, uploaded_by, document_url) 
//                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
//                         await connection.query(attachmentQuery, [
//                             id,
//                             file.mimetype,
//                             file.name,
//                             fileData.Key,
//                             file.size,
//                             file.mimetype,
//                             leave.employee_id,
//                             uploadedData.Location
//                         ]);
//                     } catch (error) {
//                         console.error('S3 upload error:', error);
//                         throw new Error('Failed to upload file to S3');
//                     }
//                 }
//             }

//             await connection.commit();
//             res.status(200).json({ message: 'Leave application updated successfully' });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in updateLeave:', error);
//         if (error.message && error.message.includes('Invalid file type')) {
//             return res.status(400).json({ error: error.message });
//         }
//         res.status(500).json({ error: 'Error updating leave application' });
//     }
// };

// // Get leave documents by leave application ID
// const getLeaveDocumentsByLeaveApplicationId = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const [documents] = await dbPromise.query(
//             'SELECT * FROM leave_documents WHERE leave_application_id = ?',
//             [id]
//         );
//         if (!documents || documents.length === 0) {
//             return res.status(404).json({ error: 'No documents found for this leave application' });
//         }
//         res.json(documents);
//     } catch (error) {
//         console.error('Error in getLeaveDocumentsByLeaveApplicationId:', error);
//         res.status(500).json({ error: 'Error fetching leave documents' });
//     }
// };

// const cancelLeave = async (req, res) => {
//     const { id } = req.params;
//     const { employee_id } = req.body;

//     try {
//         // First check if the leave application exists and belongs to the employee
//         const [leaveApplication] = await dbPromise.query(
//             'SELECT * FROM leave_applications WHERE id = ? AND employee_id = ?',
//             [id, employee_id]
//         );

//         if (!leaveApplication || leaveApplication.length === 0) {
//             return res.status(404).json({ message: 'Leave application not found or unauthorized' });
//         }

//         // Check if the leave application is in a state that can be cancelled
//         if (!['PENDING', 'FIRST_APPROVED'].includes(leaveApplication[0].status)) {
//             return res.status(400).json({ 
//                 message: 'Leave application can only be cancelled if it is pending or first approved' 
//             });
//         }

//         // Update the leave application status to CANCELLED
//         await dbPromise.query(
//             'UPDATE leave_applications SET status = ?, updated_at = NOW() WHERE id = ?',
//             ['CANCELLED', id]
//         );

//         res.status(200).json({ message: 'Leave application cancelled successfully' });
//     } catch (error) {
//         console.error('Error cancelling leave application:', error);
//         res.status(500).json({ message: 'Error cancelling leave application' });
//     }
// };

// // Create new leave application
// const adminCreateLeave = async (req, res) => {
//     try {               
//         const {
//             admin_id,
//             employee_id,
//             leave_type_id,
//             start_date,
//             end_date,
//             reason,
//             is_half_day
//         } = req.body;

//         // Calculate duration
//         let duration = calculateBusinessDays(start_date, end_date);

//         if (is_half_day) {
//             duration = 0.5;
//         }

//         // get employee details
//         const [employee] = await dbPromise.query(
//             'SELECT * FROM employees WHERE id = ?',
//             [employee_id]
//         );

//         // Get leave type to check if it's unpaid leave
//         const [leaveType] = await dbPromise.query(
//             'SELECT * FROM leave_types WHERE id = ?',
//             [leave_type_id]
//         );

//         // get employee leave type
//         const [employeeLeaveType] = await dbPromise.query(
//             'SELECT * FROM leave_types WHERE company_id = ? AND code = ?',
//             [employee[0].company_id, leaveType[0].code]
//         );

//         // Skip balance check for unpaid leave
//         if (leaveType[0]?.code !== 'UNPAID') {
//             // Check leave balance
//             const balanceQuery = `
//                 SELECT * FROM leave_balances 
//                 WHERE employee_id = ? 
//                 AND leave_type_id = ? 
//                 AND year = YEAR(CURRENT_DATE)
//             `;
            
//             const [balances] = await dbPromise.query(balanceQuery, [employee_id, employeeLeaveType[0].id]);
            
//             if (balances.length === 0 || balances[0].remaining_days < duration) {
//                 return res.status(400).json({ 
//                     error: 'Insufficient leave balance' 
//                 });
//             }
//         }

//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
            
//             const [employee] = await connection.query(
//                 'SELECT id, name, manager_id, superior, role, company_id, department_id FROM employees WHERE id = ?',
//                 [employee_id]
//             ); 

//             // Create leave application
//             const leaveQuery = `
//                 INSERT INTO leave_applications 
//                 (employee_id, leave_type_id, start_date, end_date, duration, reason, status, company_id, department_id) 
//                 VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
//             `;
            
//             const [result] = await connection.query(leaveQuery, [
//                 employee_id,
//                 employeeLeaveType[0].id,
//                 start_date,
//                 end_date,
//                 duration,
//                 reason,
//                 employee[0].company_id,
//                 employee[0].department_id
//             ]);

//             const leaveId = result.insertId;

//             // Handle multiple file attachments if present
//             if (req.files) {
//                 // Support both single and multiple attachments[]
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                       ? req.files['attachments[]']
//                       : [req.files['attachments[]']];
//                   } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                       ? req.files.attachments
//                       : [req.files.attachments];
//                   } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                   }
                  
//                 for (const file of attachments) {
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `leaves/${employee_id}/${leaveId}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
//                     // Upload to S3
//                     const s3 = new AWS.S3({
//                         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                         region: process.env.AWS_REGION,
//                         signatureVersion: 'v4',
//                         endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                     });
//                     try {
//                         const uploadedData = await s3.upload(fileData).promise();
//                         // Save attachment reference in database
//                         const attachmentQuery = `INSERT INTO leave_documents 
//                             (
//                                 leave_application_id, 
//                                 document_type, 
//                                 file_name, 
//                                 file_path, 
//                                 file_size, 
//                                 file_type, 
//                                 uploaded_by, 
//                                 document_url
//                             ) 
//                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//                             `;
//                         await connection.query(attachmentQuery, [
//                             leaveId,
//                             file.mimetype,
//                             file.name,
//                             fileData.Key,
//                             file.size,
//                             file.mimetype,
//                             employee_id,
//                             uploadedData.Location
//                         ]);
//                     } catch (error) {
//                         console.error('S3 upload error:', error);
//                         throw new Error('Failed to upload file to S3');
//                     }
//                 }
//             }

//             // Create leave approval work flow        
//             const approvalWorkflowQuery = `
//                 INSERT INTO leave_approval_workflow 
//                 (leave_application_id, approver_id, level, status, comments) 
//                 VALUES (?, ?, 1, 'APPROVAL_REQUIRED', ?)
//             `;
            
//             if (employee[0] !== null && employee[0].manager_id !== null) {
//                 await connection.query(approvalWorkflowQuery, [
//                     leaveId,
//                     employee[0].superior,
//                     `New leave request from ${employee[0].name} needs your approval`
//                 ]);
//             }

//             await connection.commit();
//             res.status(201).json({ 
//                 message: 'Leave application created successfully',
//                 leaveId 
//             });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in createLeave:', error);
//         if (error.message.includes('Invalid file type')) {
//             return res.status(400).json({ error: error.message });
//         }
//         res.status(500).json({ error: 'Error creating leave application' });
//     }
// };

// // Update leave application (for PENDING or FIRST_APPROVED status)
// const adminUpdateLeave = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const {
//             leave_type_id,
//             start_date,
//             end_date,
//             reason,
//             is_half_day
//         } = req.body;

//         // Get the leave application
//         const [leaves] = await dbPromise.query('SELECT * FROM leave_applications WHERE id = ?', [id]);
//         if (leaves.length === 0) {
//             return res.status(404).json({ error: 'Leave application not found' });
//         }
//         const leave = leaves[0];
//         if (!(leave.status === 'PENDING' || leave.status === 'FIRST_APPROVED')) {
//             return res.status(400).json({ error: 'Only pending or first approved leave requests can be updated' });
//         }

//         // Calculate new duration
//         let duration = calculateBusinessDays(start_date, end_date);

//         if (is_half_day) {
//             duration = 0.5;
//         }

//         // Get leave type to check if it's unpaid leave
//         const [leaveType] = await dbPromise.query(
//             'SELECT * FROM leave_types WHERE id = ?',
//             [leave_type_id]
//         );

//         // Skip balance check for unpaid leave
//         if (leaveType[0]?.code !== 'UNPAID') {
//             // Check leave balance
//             const balanceQuery = `
//                 SELECT * FROM leave_balances 
//                 WHERE employee_id = ? 
//                 AND leave_type_id = ? 
//                 AND year = YEAR(CURRENT_DATE)
//             `;
//             const [balances] = await dbPromise.query(balanceQuery, [leave.employee_id, leave_type_id]);
//             if (balances.length === 0 || balances[0].remaining_days + leave.duration < duration) {
//                 // Add back the old duration before checking
//                 return res.status(400).json({ error: 'Insufficient leave balance for update' });
//             }
//         }

//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         try {
//             // Update leave application
//             const updateQuery = `
//                 UPDATE leave_applications 
//                 SET leave_type_id = ?, start_date = ?, end_date = ?, duration = ?, reason = ?
//                 WHERE id = ?
//             `;
//             await connection.query(updateQuery, [leave_type_id, start_date, end_date, duration, reason, id]);

//             // Handle file attachment if present
//             if (req.files) {
//                 // Support both single and multiple attachments[]
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                       ? req.files['attachments[]']
//                       : [req.files['attachments[]']];
//                   } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                       ? req.files.attachments
//                       : [req.files.attachments];
//                   } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                   }
                
//                   await dbPromise.query(
//                     'DELETE FROM leave_documents WHERE leave_application_id = ?',
//                     [id]
//                 );   

//                 for (const file of attachments) {
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `leaves/${leave.employee_id}/${id}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
//                     const s3 = new AWS.S3({
//                         accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                         secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                         region: process.env.AWS_REGION,
//                         signatureVersion: 'v4',
//                         endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                     });
//                     try {
//                         const uploadedData = await s3.upload(fileData).promise();
//                         // Save attachment reference in database
//                         const attachmentQuery = `INSERT INTO leave_documents 
//                             (leave_application_id, document_type, file_name, file_path, file_size, file_type, uploaded_by, document_url) 
//                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
//                         await connection.query(attachmentQuery, [
//                             id,
//                             file.mimetype,
//                             file.name,
//                             fileData.Key,
//                             file.size,
//                             file.mimetype,
//                             leave.employee_id,
//                             uploadedData.Location
//                         ]);
//                     } catch (error) {
//                         console.error('S3 upload error:', error);
//                         throw new Error('Failed to upload file to S3');
//                     }
//                 }
//             }

//             await connection.commit();
//             res.status(200).json({ message: 'Leave application updated successfully' });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error('Error in updateLeave:', error);
//         if (error.message && error.message.includes('Invalid file type')) {
//             return res.status(400).json({ error: error.message });
//         }
//         res.status(500).json({ error: 'Error updating leave application' });
//     }
// };

// const updateLeaveBalanceJobByCompanyId = async (req, res) => {
//     const { company_id } = req.params;
//     const query = `SELECT 
//                 e.id as employee_id,
//                 e.joined_date,
//                 e.company_id,
//                 e.department_id
//             FROM 
//                 employees e
//             WHERE 
//                 e.status = 'Active'
//                 AND e.company_id = ${company_id}
//                 AND e.id != 1  -- Skip admin account`;
//     updateLeaveBalanceDailyJob(query);
//     res.status(200).json({ message: 'Leave balance updated successfully' });
// };

// const updateLeaveBalanceJob = async () => {
//     const query = `
//             SELECT 
//                 e.id as employee_id,
//                 e.joined_date,
//                 e.company_id,
//                 e.department_id
//             FROM 
//                 employees e
//             WHERE 
//                 e.status = 'Active'
//                 AND e.id != 1  -- Skip admin account
//         `;
//     updateLeaveBalanceDailyJob(query);
// };

// const updateLeaveBalanceDailyJob = async (query) => {
//     console.log('Start scheduled job: Update daily leave balance', new Date());    
    
//     const connection = await dbPromise.getConnection();
    
//     try {
//         await connection.beginTransaction();

//         // Get all active employees
//         const [activeEmployees] = await connection.query(query);
        
//         console.log(`Found ${activeEmployees.length} active employees`);
        
//         const currentYear = new Date().getFullYear();
//         const currentDate = new Date();

//         console.log(`Today is ${currentDate}`);
        
//         // Check if it's the first day of the year
//         const isNewYear = currentDate.getMonth() === 0 && currentDate.getDate() === 1;
        
//         for (const employee of activeEmployees) {
//             const joinDate = new Date(employee.joined_date);
            
//             // Skip if join date is in the future
//             if (joinDate > currentDate) {
//                 console.log(`Skipping employee ${employee.employee_id} - join date is in the future`);
//                 continue;
//             }
            
//             console.log(`Employee ${employee.employee_id} with join date ${joinDate} is active`);
//             // Check if today is last day of the month
//             const isLastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() === currentDate.getDate();

//             // Check if today is work anniversary
//             const isWorkAnniversary = 
//                 joinDate.getDate() === currentDate.getDate() && 
//                 joinDate.getMonth() === currentDate.getMonth() && 
//                 joinDate.getFullYear() !== currentDate.getFullYear();
        
//             // Get all active leave types
//             const [leaveTypes] = await connection.query(`
//                 SELECT 
//                     id,
//                     leave_type_name,
//                     code,
//                     description,
//                     max_days,
//                     requires_approval,
//                     requires_documentation,
//                     is_active,
//                     created_at,
//                     updated_at,
//                     company_id,
//                     is_total,
//                     total_type,
//                     is_divident,
//                     increment_days,
//                     max_increment_days,
//                     carry_forward_days
//                 FROM 
//                     leave_types
//                 WHERE company_id = ?
//                     AND is_active = ?
//             `, [employee.company_id, 1]);
            
//             console.log(`Found ${leaveTypes.length} active leave types for company ${employee.company_id} related to employee ${employee.employee_id}`);
            
//             for (const leaveType of leaveTypes) {
//                 // Check if leave balance exists for this employee and leave type
//                 const [existingBalance] = await connection.query(`
//                     SELECT id, used_days, remaining_days, total_days, accrual_days, accrual_remaining_days
//                     FROM leave_balances
//                     WHERE employee_id = ?
//                     AND leave_type_id = ?
//                     AND year = ?
//                 `, [employee.employee_id, leaveType.id, currentYear]);  

//                 if (existingBalance.length > 0) {
//                     console.log(`Employee ${employee.employee_id} has leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
//                 }
//                 else {
//                     console.log(`Employee ${employee.employee_id} has no leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
//                 }

//                 let leaveBalanceId = existingBalance[0] != undefined ? existingBalance[0].id : 0;

//                 if (isWorkAnniversary) {
//                     console.log(`Employee ${employee.employee_id} has work anniversary today`);
//                     // Update leave balance for work anniversary                    
//                     const yearsOfService = currentDate.getFullYear() - joinDate.getFullYear();   
                    
//                     // total 
//                     const maxDays = leaveType.max_days !== null ? leaveType.max_days : 0;
//                     const maxIncrementDays = leaveType.max_increment_days !== null ? leaveType.max_increment_days : 0;
//                     const incrementDays = leaveType.increment_days !== null ? leaveType.increment_days : 0;
//                     const incrementDaysToAdd = incrementDays !== 0 ? yearsOfService * incrementDays : 0;
                    
//                     // Calculate total days considering max increment limit
//                     let totalDays = maxDays + incrementDaysToAdd;
//                     if (maxIncrementDays !== 0) {
//                         totalDays = Math.min(totalDays, maxIncrementDays);
//                     }
                    
//                     // Get used days from existing balance
//                     const usedDays = existingBalance[0]?.used_days !== undefined ? existingBalance[0].used_days : 0;
//                     const remainingDays = totalDays - usedDays;

//                     // accrual
//                     const accrualDays = totalDays / 12;
//                     const newAccrualDays = accrualDays;
//                     const newAccrualRemainingDays = existingBalance[0].accrual_remaining_days + accrualDays - usedDays;
                    
//                     console.log(`Updating work anniversary leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}`);
//                     console.log(`Years of service: ${yearsOfService}, Increment days: ${leaveType.max_increment_days}`);
                    
//                     await connection.query(`
//                         UPDATE leave_balances
//                         SET 
//                             total_days = ?,
//                             remaining_days = ?,
//                             accrual_days = ?,
//                             accrual_remaining_days = ?
//                         WHERE id = ?
//                     `, [totalDays, remainingDays, newAccrualDays, newAccrualRemainingDays, leaveBalanceId]);
//                 } 
                
//                 if (isLastDayOfMonth) {
//                     console.log(`Today is last day of the month - updating monthly leave balances for employee ${employee.employee_id}`);

//                     // Regular monthly increment for dividend leave types   
//                     const totalDays = existingBalance[0]?.total_days;
//                     const remainingDays = totalDays - existingBalance[0]?.used_days;
//                     const accrualDays = totalDays / 12;

//                     const newAccrualDays = accrualDays;
//                     const newAccrualRemainingDays = existingBalance[0].accrual_remaining_days + accrualDays;
                        
//                     console.log(`Updating dividend leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}`);
                    
//                     await connection.query(`
//                         UPDATE leave_balances
//                         SET 
//                             remaining_days = ?,
//                             accrual_days = ?,
//                             accrual_remaining_days = ?
//                         WHERE id = ?
//                     `, [remainingDays, newAccrualDays, newAccrualRemainingDays, leaveBalanceId]);
//                 }
//             }
//         }
        
//         await connection.commit();
//         console.log('End scheduled job: Update daily leave balance', new Date());
//     } catch (error) {
//         await connection.rollback();
//         console.error('Error in updateLeaveBalanceJobByCompanyId:', error);
//     } finally {
//         connection.release();
//     }
// };

// // Execute this function when create a new employee
// const updateLeaveBalanceByEmployeeId = async (req, res) => {
//     const { employee_id } = req.params;
//     console.log(`Start update leave balance by employee id ${employee_id}`, new Date());    
    
//     const connection = await dbPromise.getConnection();
    
//     try {
//         await connection.beginTransaction();

//         // Get all active employees
//         const query = `SELECT 
//                 e.id as employee_id,
//                 e.joined_date,
//                 e.company_id,
//                 e.department_id
//             FROM 
//                 employees e
//             WHERE 
//                 e.status = 'Active'
//                 AND e.id = ?
//                 AND e.id != 1  -- Skip admin account`;
//         const [activeEmployees] = await connection.query(query,[employee_id]);
        
//         console.log(`Found ${activeEmployees.length} active employees`);
        
//         const currentYear = new Date().getFullYear();
//         const currentDate = new Date();

//         console.log(`Today is ${currentDate}`);
        
//         for (const employee of activeEmployees) {
//             const joinDate = new Date(employee.joined_date);
            
//             // Skip if join date is in the future
//             if (joinDate > currentDate) {
//                 console.log(`Skipping employee ${employee.employee_id} - join date is in the future`);
//                 continue;
//             }
            
//             console.log(`Employee ${employee.employee_id} with join date ${joinDate} is active`);
        
//             // Get all active leave types
//             const [leaveTypes] = await connection.query(`
//                 SELECT 
//                     id,
//                     leave_type_name,
//                     code,
//                     description,
//                     max_days,
//                     requires_approval,
//                     requires_documentation,
//                     is_active,
//                     created_at,
//                     updated_at,
//                     company_id,
//                     is_total,
//                     total_type,
//                     is_divident,
//                     increment_days,
//                     max_increment_days,
//                     carry_forward_days
//                 FROM 
//                     leave_types
//                 WHERE company_id = ?
//                     AND is_active = ?
//             `, [employee.company_id, 1]);
            
//             console.log(`Found ${leaveTypes.length} active leave types for company ${employee.company_id} related to employee ${employee.employee_id}`);
            
//             for (const leaveType of leaveTypes) {
//                 // Check if leave balance exists for this employee and leave type
//                 const [existingBalance] = await connection.query(`
//                     SELECT id, used_days, remaining_days
//                     FROM leave_balances
//                     WHERE employee_id = ?
//                     AND leave_type_id = ?
//                     AND year = ?
//                 `, [employee.employee_id, leaveType.id, currentYear]);  

//                 if (existingBalance.length > 0) {
//                     console.log(`Employee ${employee.employee_id} has leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
//                     console.log(existingBalance);
//                 }
//                 else {
//                     console.log(`Employee ${employee.employee_id} has no leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
//                 }

//                 let leaveBalanceId = existingBalance[0] != undefined ? existingBalance[0].id : 0;
//                 if (existingBalance.length === 0) {
//                     // Create new leave balance
//                     console.log(`Creating new leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}`);

//                     const accrualDays = leaveType.max_days / 12;
//                     const newAccrualDays = accrualDays;
                    
//                     await connection.query(`
//                         INSERT INTO leave_balances (
//                             employee_id,
//                             leave_type_id,
//                             year,
//                             total_days,
//                             used_days,
//                             remaining_days,
//                             accrual_days,
//                             accrual_remaining_days
//                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//                     `, [
//                         employee.employee_id,
//                         leaveType.id,
//                         currentYear,
//                         leaveType.max_days,
//                         0,
//                         0,
//                         newAccrualDays,
//                         0
//                     ]);

//                     // Get the newly inserted ID
//                     const [newId] = await connection.query('SELECT LAST_INSERT_ID() as id');
//                     leaveBalanceId = newId[0].id;
//                     console.log(`Inserted leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
//                 }
//             }
//         }
        
//         await connection.commit();
//         console.log('End scheduled job: Update daily leave balance', new Date());
//         res.status(200).json({ message: 'Leave balance updated successfully for employee id ' + employee_id });
//     } catch (error) {
//         await connection.rollback();
//         console.error('Error in updateLeaveBalanceJobByCompanyId:', error);
//     } finally {
//         connection.release();
//     }
// };

// const calculateBusinessDays = (startDate, endDate) => {
//     const start = new Date(startDate);
//     const end = new Date(endDate);
//     let count = 0;
//     const current = new Date(start);

//     while (current <= end) {
//         // Skip weekends (0 = Sunday, 6 = Saturday)
//         if (current.getDay() !== 0 && current.getDay() !== 6) {
//             count++;
//         }
//         current.setDate(current.getDate() + 1);
//     }
//     return count;
// };

// module.exports = {
//     getAllLeaves,
//     getAllLeavesByEmployeeId,
//     getRecentLeaves,
//     getLeaveById,
//     createLeave,
//     approveLeave,
//     rejectLeave,
//     getLeaveBalance,
//     getLeaveCalendar,
//     getLeaveNotifications,
//     updateNotificationStatus,
//     uploadLeaveDocuments,
//     getLeaveDocuments,
//     getAllLeaveTypes,
//     getLeaveTypeById,
//     getLeaveTypesByCompanyId,
//     getLeaveTypesByEmployeeId,
//     createLeaveType,
//     updateLeaveType,
//     deleteLeaveType,
//     getLeaveTypeStats,
//     downloadAttachment,
//     generateSampleLeaves,
//     bulkUpdateLeaveTypes,
//     bulkCreateLeaveTypes,
//     updateLeave,
//     getLeaveDocumentsByLeaveApplicationId,
//     cancelLeave,
//     getLeavesForCalendarByEmployeeId,
//     adminCreateLeave,
//     adminUpdateLeave,
//     updateLeaveBalanceJob,
//     updateLeaveBalanceJobByCompanyId,
//     updateLeaveBalanceByEmployeeId
// };


//NEW

const { dbPromise } = require('../models/db');
const AWS = require('aws-sdk');
const { sendLeaveEmail } = require('./notifications'); // Adjust path as needed

// Get all leave applications with filters
const getAllLeaves = async (req, res) => {
    try {
        const { status, employeeId, startDate, endDate, departmentId } = req.query;

        let query = `
            SELECT 
                l.*,
                e.name as employee_name,
                c.id as company_id,
                c.name as company_name,
                d.id as department_id,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            LEFT JOIN 
                companies c ON e.company_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND l.status = ?';
            params.push(status);
        }
        
        if (employeeId) {
            query += ' AND l.employee_id = ?';
            params.push(employeeId);
        }
        
        if (departmentId) {
            query += ' AND e.department_id = ?';
            params.push(departmentId);
        }
        
        if (startDate && endDate) {
            query += ' AND l.start_date >= ? AND l.end_date <= ?';
            params.push(startDate, endDate);
        }
        
        query += ' ORDER BY l.created_at DESC';
        
        const [leaves] = await dbPromise.query(query, params);
        res.json(leaves);
    } catch (error) {
        console.error('Error in getAllLeaves:', error);
        res.status(500).json({ error: 'Error fetching leaves' });
    }
};

const getAllLeavesByEmployeeId = async (req, res) => {
    try {
        const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
        const [employee] = await dbPromise.query(
            'SELECT id, name, manager_id, superior, role FROM employees WHERE id = ?',
            [employeeId]
        ); 

        let query = `
            SELECT 
                l.*,
                e.name as employee_name,
                c.id as company_id,
                c.name as company_name,
                d.id as department_id,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            LEFT JOIN 
                companies c ON e.company_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND l.status = ?';
            params.push(status);
        }
        
        if (employeeId) {
            query += ' AND l.employee_id = ?';    
            params.push(employeeId);
        }
        
        if (employee[0].role === 'supervisor') {
            query += ' OR (e.superior = ?)';
            params.push(employeeId);
        }
        
        if (employee[0].role === 'manager') {
            query += ' OR (e.manager_id = ? AND l.status != ?)';            
            params.push(employeeId, 'PENDING');
            query += ' OR (e.manager_id = ? and l.status = ? and e.superior = ?)';
            params.push(employeeId, 'PENDING', employeeId);
        }
        
        if (departmentId) {
            query += ' AND e.department_id = ?';
            params.push(departmentId);
        }
        
        if (startDate && endDate) {
            query += ' AND l.start_date >= ? AND l.end_date <= ?';
            params.push(startDate, endDate);
        }
        
        query += ' ORDER BY l.created_at DESC';
        
        const [leaves] = await dbPromise.query(query, params);
        res.json(leaves);
    } catch (error) {
        console.error('Error in getAllLeaves:', error);
        res.status(500).json({ error: 'Error fetching leaves' });
    }
};

const getLeavesForCalendarByEmployeeId = async (req, res) => {
    try {
        const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
        const [employee] = await dbPromise.query(
            'SELECT id, name, manager_id, superior, role, company_id FROM employees WHERE id = ?',
            [employeeId]
        ); 

        let query = `
            SELECT 
                l.*,
                e.name as employee_name,
                c.id as company_id,
                c.name as company_name,
                d.id as department_id,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            LEFT JOIN 
                companies c ON e.company_id = c.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (departmentId) {
            query += ' AND e.department_id = ?';
            params.push(departmentId);
        }
        
        if (startDate && endDate) {
            query += ' AND l.start_date >= ? AND l.end_date <= ?';
            params.push(startDate, endDate);
        }
        
        query += ' AND l.company_id = ?';
        params.push(employee[0].company_id);

        query += ' ORDER BY l.created_at DESC';
        
        const [leaves] = await dbPromise.query(query, params);
        res.json(leaves);
    } catch (error) {
        console.error('Error in getAllLeaves:', error);
        res.status(500).json({ error: 'Error fetching leaves' });
    }
};

const getRecentLeaves = async (req, res) => {
    try {
        const { status, employeeId, startDate, endDate, departmentId } = req.query;
        
        let query = `
            SELECT
                l.*,
                e.name as employee_name,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            WHERE 1=1
        `;
        
        const params = [];
        
        if (status) {
            query += ' AND l.status = ?';
            params.push(status);
        }
        
        if (employeeId) {
            query += ' AND l.employee_id = ?';
            params.push(employeeId);
        }
        
        if (departmentId) {
            query += ' AND e.department_id = ?';
            params.push(departmentId);
        }
        
        if (startDate && endDate) {
            query += ' AND l.start_date >= ? AND l.end_date <= ?';
            params.push(startDate, endDate);
        }
        
        query += ' ORDER BY l.created_at DESC LIMIT 8';
        
        const [leaves] = await dbPromise.query(query, params);
        res.json(leaves);
    } catch (error) {
        console.error('Error in getAllLeaves:', error);
        res.status(500).json({ error: 'Error fetching leaves' });
    }
};

// Get leave application by ID
const getLeaveById = async (req, res) => {
    try {
        const { id } = req.params;
        
        const query = `
            SELECT 
                l.*,
                e.name as employee_name,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name,
                ld.document_url,
                ld.document_type,
                ld.file_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            LEFT JOIN 
                leave_documents ld ON l.id = ld.leave_application_id
            WHERE 
                l.id = ?
        `;
        
        const [leaves] = await dbPromise.query(query, [id]);
        
        if (leaves.length === 0) {
            return res.status(404).json({ error: 'Leave application not found' });
        }
        
        res.json(leaves[0]);
    } catch (error) {
        console.error('Error in getLeaveById:', error);
        res.status(500).json({ error: 'Error fetching leave details' });
    }
};

// Create new leave application
const createLeave = async (req, res) => {
    try {               
        const {
            employee_id,
            leave_type_id,
            start_date,
            end_date,
            reason,
            is_half_day
        } = req.body;

        // Calculate duration
        let duration = calculateBusinessDays(start_date, end_date);

        if (is_half_day) {
            duration = 0.5;
        }

        // Get leave type to check if it's unpaid leave
        const [leaveType] = await dbPromise.query(
            'SELECT * FROM leave_types WHERE id = ?',
            [leave_type_id]
        );

        // Skip balance check for unpaid leave
        if (leaveType[0]?.code !== 'UNPAID') {
            // Check leave balance
            const balanceQuery = `
                SELECT * FROM leave_balances 
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(CURRENT_DATE)
            `;
            
            const [balances] = await dbPromise.query(balanceQuery, [employee_id, leave_type_id]);
            
            if (balances.length === 0 || balances[0].remaining_days < duration) {
                return res.status(400).json({ 
                    error: 'Insufficient leave balance' 
                });
            }
        }

        // Start transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            
            const [employee] = await connection.query(
                'SELECT id, name, manager_id, superior, role, company_id, department_id FROM employees WHERE id = ?',
                [employee_id]
            ); 

            // Create leave application
            const leaveQuery = `
                INSERT INTO leave_applications 
                (employee_id, leave_type_id, start_date, end_date, duration, reason, status, company_id, department_id) 
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `;
            
            const [result] = await connection.query(leaveQuery, [
                employee_id,
                leave_type_id,
                start_date,
                end_date,
                duration,
                reason,
                employee[0].company_id,
                employee[0].department_id
            ]);

            const leaveId = result.insertId;

            // Handle multiple file attachments if present
            if (req.files) {
                // Support both single and multiple attachments[]
                if (req.files['attachments[]']) {
                    attachments = Array.isArray(req.files['attachments[]'])
                      ? req.files['attachments[]']
                      : [req.files['attachments[]']];
                  } else if (req.files.attachments) {
                    attachments = Array.isArray(req.files.attachments)
                      ? req.files.attachments
                      : [req.files.attachments];
                  } else if (req.files.attachment) {
                    attachments = [req.files.attachment];
                  }
                  
                for (const file of attachments) {
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `leaves/${employee_id}/${leaveId}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    
                    // Upload to S3
                    const s3 = new AWS.S3({
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        region: process.env.AWS_REGION,
                        signatureVersion: 'v4',
                        endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                    });
                    try {
                        const uploadedData = await s3.upload(fileData).promise();
                        // Save attachment reference in database
                        const attachmentQuery = `INSERT INTO leave_documents 
                            (
                                leave_application_id, 
                                document_type, 
                                file_name, 
                                file_path, 
                                file_size, 
                                file_type, 
                                uploaded_by, 
                                document_url
                            ) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `;
                        await connection.query(attachmentQuery, [
                            leaveId,
                            file.mimetype,
                            file.name,
                            fileData.Key,
                            file.size,
                            file.mimetype,
                            employee_id,
                            uploadedData.Location
                        ]);
                    } catch (error) {
                        console.error('S3 upload error:', error);
                        throw new Error('Failed to upload file to S3');
                    }
                }
            }

            // Create leave approval work flow        
            const approvalWorkflowQuery = `
                INSERT INTO leave_approval_workflow 
                (leave_application_id, approver_id, level, status, comments) 
                VALUES (?, ?, 1, 'APPROVAL_REQUIRED', ?)
            `;
            
            if (employee[0] !== null && employee[0].manager_id !== null) {
                await connection.query(approvalWorkflowQuery, [
                    leaveId,
                    employee[0].superior,
                    `New leave request from ${employee[0].name} needs your approval`
                ]);
            }

            await connection.commit();
            res.status(201).json({ 
                message: 'Leave application created successfully',
                leaveId 
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in createLeave:', error);
        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error creating leave application' });
    }
};

// Approve leave application
const approveLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { approver_id, comment, approval_level } = req.body;

        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // Get leave details
            const [leaves] = await connection.query(
                'SELECT * FROM leave_applications WHERE id = ?',
                [id]
            );

            if (leaves.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Leave application not found' });
            }

            const leave = leaves[0];

            // Check if employee is an 'employee'
            const [employeeToApprove] = await connection.query(
                'SELECT manager_id, superior, role FROM employees WHERE id = ?',
                [leave.employee_id]
            );
            
            if (employeeToApprove[0].role === 'employee') {
                // Handle first level approval
                if (approval_level === 'FIRST') {
                    if (leave.status !== 'PENDING') {
                        await connection.rollback();
                        return res.status(400).json({ 
                            error: 'Leave application is not in pending status' 
                        });
                    }
    
                    // Update leave application for first approval
                    await connection.query(
                        `UPDATE leave_applications 
                        SET status = 'FIRST_APPROVED', 
                            first_approver_id = ?, 
                            first_approval_date = CURRENT_TIMESTAMP, 
                            first_approval_comment = ? 
                        WHERE id = ?`,
                        [approver_id, comment, id]
                    );
    
                    // Create approval history
                    await connection.query(
                        `INSERT INTO leave_history 
                        (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                        VALUES (?, 'FIRST_APPROVED', ?, 'PENDING', 'FIRST_APPROVED', ?)`,
                        [id, approver_id, comment]
                    );
    
                    // Create leave approval work flow            
                    const [employee] = await connection.query(
                        'SELECT name, manager_id, superior FROM employees WHERE id = ?',
                        [leave.employee_id]
                    );     
                    
                    const approvalWorkflowQuery = `
                        INSERT INTO leave_approval_workflow 
                        (leave_application_id, approver_id, level, status, comments) 
                        VALUES (?, ?, 2, 'FIRST_APPROVED', ?)
                    `;
                    
                    await connection.query(approvalWorkflowQuery, [
                        id,
                        employee[0].superior,
                        `Leave request from ${employee[0].name} first approval and need your final approval`
                    ]);
    
                    await connection.commit();
                    return res.json({ message: 'Leave application first approval completed successfully' });
                }
                
                // Handle final approval
                if (approval_level === 'FINAL') {
                    if (leave.status !== 'FIRST_APPROVED') {
                        await connection.rollback();
                        return res.status(400).json({ 
                            error: 'Leave application must be first approved before final approval' 
                        });
                    }
    
                    // Update leave application for final approval
                    await connection.query(
                        `UPDATE leave_applications 
                        SET status = 'APPROVED', 
                            second_approver_id = ?, 
                            second_approval_date = CURRENT_TIMESTAMP, 
                            second_approval_comment = ? 
                        WHERE id = ?`,
                        [approver_id, comment, id]
                    );
    
                    // Create approval history
                    await connection.query(
                        `INSERT INTO leave_history 
                        (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                        VALUES (?, 'APPROVED', ?, 'FIRST_APPROVED', 'APPROVED', ?)`,
                        [id, approver_id, comment]
                    );
    
                    // Update leave balance
                    await connection.query(
                        `UPDATE leave_balances 
                        SET used_days = used_days + ?, 
                            remaining_days = remaining_days - ?,
                            accrual_remaining_days = accrual_remaining_days - ?
                        WHERE employee_id = ? 
                        AND leave_type_id = ? 
                        AND year = YEAR(CURRENT_DATE)`,
                        [leave.duration, leave.duration, leave.duration, leave.employee_id, leave.leave_type_id]
                    );
    
                    // Create leave approval work flow         
                    const [employee] = await connection.query(
                        'SELECT name, manager_id, superior FROM employees WHERE id = ?',
                        [leave.employee_id]
                    );

                    const approvalWorkflowQuery = `
                        INSERT INTO leave_approval_workflow 
                        (leave_application_id, approver_id, level, status, comments) 
                        VALUES (?, ?, 0, 'APPROVED', ?)
                    `;
                    
                    await connection.query(approvalWorkflowQuery, [
                        id,
                        employee[0].manager_id,
                        `Leave request from ${employee[0].name} approved`
                    ]);
    
                    await connection.commit();
                    sendLeaveEmail({ leaveId: id, kind: 'approved' }).catch(console.error);
                    return res.json({ message: 'Leave application finally approved successfully' });
                }
            }

            if (employeeToApprove[0].role === 'supervisor' || employeeToApprove[0].role === 'manager' || employeeToApprove[0].role === 'admin') {
                // Handle first level approval
                if (approval_level === 'FIRST') {
                    if (leave.status !== 'PENDING') {
                        await connection.rollback();
                        return res.status(400).json({ 
                            error: 'Leave application is not in pending status' 
                        });
                    }

                    // Update leave application for final approval
                    await connection.query(
                        `UPDATE leave_applications 
                        SET status = 'APPROVED', 
                            first_approver_id = ?, 
                            first_approval_date = CURRENT_TIMESTAMP, 
                            first_approval_comment = ? 
                        WHERE id = ?`,
                        [approver_id, comment, id]
                    );

                    // Create approval history
                    await connection.query(
                        `INSERT INTO leave_history 
                        (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                        VALUES (?, 'APPROVED', ?, 'PENDING', 'APPROVED', ?)`,
                        [id, approver_id, comment]
                    );
    
                    // Update leave balance
                    await connection.query(
                        `UPDATE leave_balances 
                        SET used_days = used_days + ?, 
                            remaining_days = remaining_days - ?,
                            accrual_remaining_days = accrual_remaining_days - ?
                        WHERE employee_id = ? 
                        AND leave_type_id = ? 
                        AND year = YEAR(CURRENT_DATE)`,
                        [leave.duration, leave.duration, leave.duration, leave.employee_id, leave.leave_type_id]
                    );

                    // Create leave approval work flow            
                    const [employee] = await connection.query(
                        'SELECT name, manager_id, superior FROM employees WHERE id = ?',
                        [leave.employee_id]
                    );
                    
                    const approvalWorkflowQuery = `
                        INSERT INTO leave_approval_workflow 
                        (leave_application_id, approver_id, level, status, comments) 
                        VALUES (?, ?, 0, 'APPROVED', ?)
                    `;
                    
                    await connection.query(approvalWorkflowQuery, [
                        id,
                        approver_id,
                        `Leave request from ${employee[0].name} approved`
                    ]);

                    await connection.commit();
                    sendLeaveEmail({ leaveId: id, kind: 'approved' }).catch(console.error);
                    return res.json({ message: 'Leave application approved successfully' });
                }
            }

            await connection.rollback();
            return res.status(400).json({ error: 'Invalid approval level' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in approveLeave:', error);
        res.status(500).json({ error: 'Error approving leave application' });
    }
};

// Reject leave application
const rejectLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { approver_id, reason, approval_level } = req.body;

        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();



        try {
            // Get leave details
            const [leaves] = await connection.query(
                'SELECT * FROM leave_applications WHERE id = ?',
                [id]
            );

            if (leaves.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Leave application not found' });
            }

            const leave = leaves[0];

            // Handle first level rejection
            if (approval_level === 'FIRST') {
                if (leave.status !== 'PENDING') {
                    await connection.rollback();
                    return res.status(400).json({ 
                        error: 'Leave application is not in pending status' 
                    });
                }

                // Update leave application
                await connection.query(
                    `UPDATE leave_applications 
                    SET status = 'REJECTED', 
                        first_approver_id = ?, 
                        rejection_reason = ?,
                        rejection_date = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                    [approver_id, reason, id]
                );
    
                // Create rejection history
                await connection.query(
                    `INSERT INTO leave_history 
                    (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                    VALUES (?, 'REJECTED', ?, 'PENDING', 'REJECTED', ?)`,
                    [id, approver_id, reason]
                );
    
                // Create leave approval work flow            
                const [employee] = await connection.query(
                    'SELECT name, manager_id, superior FROM employees WHERE id = ?',
                    [leave.employee_id]
                );        
                
                const approvalWorkflowQuery = `
                    INSERT INTO leave_approval_workflow 
                    (leave_application_id, approver_id, level, status, comments) 
                    VALUES (?, ?, 0, 'REJECTED', ?)
                `;
                
                await connection.query(approvalWorkflowQuery, [
                    leave.id,
                    employee[0].superior,
                    `Leave request from ${employee[0].name} rejected`
                ]);
            }

            // Handle final rejection
            if (approval_level === 'FINAL') {
                if (leave.status !== 'FIRST_APPROVED' && leave.status !== 'APPROVED') {
                    await connection.rollback();
                    return res.status(400).json({ 
                        error: 'Leave application must be first approved before final approval' 
                    });
                }

                // Update leave application
                await connection.query(
                    `UPDATE leave_applications 
                    SET status = 'REJECTED', 
                        second_approver_id = ?, 
                        rejection_reason = ?,
                        rejection_date = CURRENT_TIMESTAMP 
                    WHERE id = ?`,
                    [approver_id, reason, id]
                );
    
                // Create rejection history
                await connection.query(
                    `INSERT INTO leave_history 
                    (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                    VALUES (?, 'REJECTED', ?, 'PENDING', 'REJECTED', ?)`,
                    [id, approver_id, reason]
                );
    
                // Create leave approval work flow                   
                const [employee] = await connection.query(
                    'SELECT name, manager_id FROM employees WHERE id = ?',
                    [leave.employee_id]
                );         
                
                const approvalWorkflowQuery = `
                    INSERT INTO leave_approval_workflow 
                    (leave_application_id, approver_id, level, status, comments) 
                    VALUES (?, ?, 0, 'REJECTED', ?)
                `;

                if(leave.status === 'APPROVED'){

                    const [leaveBalances] = await connection.query(
                        `UPDATE leave_balances 
                        SET used_days = used_days - ?,
                        remaining_days = remaining_days + ?
                        WHERE employee_id = ? AND leave_type_id = ? AND year = YEAR(CURRENT_DATE)`,
                        [leave.duration, leave.duration, leave.employee_id, leave.leave_type_id]
                    );
                }
                await connection.query(approvalWorkflowQuery, [
                    leave.id,
                    employee[0].manager_id || approver_id,
                    `Leave request from ${employee[0].name} rejected`
                ]);
            }

            await connection.commit();
            sendLeaveEmail({ leaveId: id, kind: 'rejected', reason }).catch(console.error);
            res.json({ message: 'Leave application rejected successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in rejectLeave:', error);
        res.status(500).json({ error: 'Error rejecting leave application' });
    }
};

// Get leave balance
const getLeaveBalance = async (req, res) => {
    try {
        const { employeeId, year } = req.query;
        const currentYear = year || new Date().getFullYear();

        const query = `
            SELECT 
                lb.*,
                lt.leave_type_name,
                lt.is_total,
                lt.total_type,
                lt.is_divident
            FROM 
                leave_balances lb
            JOIN 
                leave_types lt ON lb.leave_type_id = lt.id
            WHERE 
                lb.employee_id = ? 
                AND lb.year = ?
        `;

        const [balances] = await dbPromise.query(query, [employeeId, currentYear]);
        res.json(balances);
    } catch (error) {
        console.error('Error in getLeaveBalance:', error);
        res.status(500).json({ error: 'Error fetching leave balance' });
    }
};

// Get leave calendar
const getLeaveCalendar = async (req, res) => {
    try {
        const { startDate, endDate, departmentId } = req.query;

        const query = `
            SELECT 
                lce.*,
                e.name as employee_name,
                d.department_name,
                la.leave_type_id,
                lt.leave_type_name
            FROM 
                leave_calendar_events lce
            JOIN 
                leave_applications la ON lce.leave_application_id = la.id
            JOIN 
                employees e ON la.employee_id = e.id
            JOIN 
                departments d ON e.department_id = d.id
            JOIN 
                leave_types lt ON la.leave_type_id = lt.id
            WHERE 
                lce.event_date BETWEEN ? AND ?
                ${departmentId ? 'AND e.department_id = ?' : ''}
        `;

        const params = [startDate, endDate];
        if (departmentId) {
            params.push(departmentId);
        }

        const [events] = await dbPromise.query(query, params);
        res.json(events);
    } catch (error) {
        console.error('Error in getLeaveCalendar:', error);
        res.status(500).json({ error: 'Error fetching calendar events' });
    }
};

// Get leave notifications
const getLeaveNotifications = async (req, res) => {
    try {
        const { recipientId, isRead } = req.query;

        const query = `
            SELECT 
                ln.*,
                la.leave_type_id,
                lt.leave_type_name,
                e.name as employee_name
            FROM 
                leave_notifications ln
            JOIN 
                leave_applications la ON ln.leave_application_id = la.id
            JOIN 
                leave_types lt ON la.leave_type_id = lt.id
            JOIN 
                employees e ON la.employee_id = e.id
            WHERE 
                ln.recipient_id = ?
                ${isRead ? 'AND ln.is_read = ?' : ''}
            ORDER BY 
                ln.created_at DESC
        `;

        const params = [recipientId];
        if (isRead) {
            params.push(isRead === 'true');
        }

        const [notifications] = await dbPromise.query(query, params);
        res.json(notifications);
    } catch (error) {
        console.error('Error in getLeaveNotifications:', error);
        res.status(500).json({ error: 'Error fetching notifications' });
    }
};

// Update notification status
const updateNotificationStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { isRead } = req.body;

        await dbPromise.query(
            `UPDATE leave_notifications 
            SET is_read = ?, 
                read_at = CURRENT_TIMESTAMP 
            WHERE id = ?`,
            [isRead, id]
        );

        res.json({ message: 'Notification status updated successfully' });
    } catch (error) {
        console.error('Error in updateNotificationStatus:', error);
        res.status(500).json({ error: 'Error updating notification status' });
    }
};

// Upload leave documents
const uploadLeaveDocuments = async (req, res) => {
    try {
        const { id } = req.params;
        const { documents } = req.body;

        const query = `
            INSERT INTO leave_documents 
            (leave_application_id, document_url, document_type) 
            VALUES ?
        `;

        const values = documents.map(doc => [id, doc.url, doc.type]);
        await dbPromise.query(query, [values]);

        res.json({ message: 'Documents uploaded successfully' });
    } catch (error) {
        console.error('Error in uploadLeaveDocuments:', error);
        res.status(500).json({ error: 'Error uploading documents' });
    }
};

// Get leave documents
const getLeaveDocuments = async (req, res) => {
    try {
        const { id } = req.params;

        const [documents] = await dbPromise.query(
            'SELECT * FROM leave_documents WHERE leave_application_id = ?',
            [id]
        );

        res.json(documents);
    } catch (error) {
        console.error('Error in getLeaveDocuments:', error);
        res.status(500).json({ error: 'Error fetching documents' });
    }
};

// Get all leave types
const getAllLeaveTypes = async (req, res) => {
    try {
        const query = `
            SELECT 
                lt.*,
                c.name as company_name,
                c.registration_number,
                COUNT(DISTINCT la.id) as total_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications
            FROM 
                leave_types lt
            LEFT JOIN 
                leave_applications la ON lt.id = la.leave_type_id
            LEFT JOIN 
                companies c ON lt.company_id = c.id
            GROUP BY 
                lt.id
            ORDER BY 
                lt.id
        `;

        const [leaveTypes] = await dbPromise.query(query);
        res.json(leaveTypes);
    } catch (error) {
        console.error('Error in getAllLeaveTypes:', error);
        res.status(500).json({ error: 'Error fetching leave types' });
    }
};

// Get leave type by ID
const getLeaveTypeById = async (req, res) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT 
                lt.*,
                COUNT(DISTINCT la.id) as total_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications,
                COUNT(DISTINCT lb.id) as total_balances
            FROM 
                leave_types lt
            LEFT JOIN 
                leave_applications la ON lt.id = la.leave_type_id
            LEFT JOIN 
                leave_balances lb ON lt.id = lb.leave_type_id
            WHERE 
                lt.id = ?
            GROUP BY 
                lt.id
        `;

        const [leaveTypes] = await dbPromise.query(query, [id]);

        if (leaveTypes.length === 0) {
            return res.status(404).json({ error: 'Leave type not found' });
        }

        res.json(leaveTypes[0]);
    } catch (error) {
        console.error('Error in getLeaveTypeById:', error);
        res.status(500).json({ error: 'Error fetching leave type details' });
    }
};

// Get leave types by company ID
const getLeaveTypesByCompanyId = async (req, res) => {
    try {
        const { companyId } = req.params;

        const query = `
            SELECT 
                lt.*,
                c.name as company_name,
                c.registration_number
            FROM 
                leave_types lt
            LEFT JOIN 
                companies c ON lt.company_id = c.id
            WHERE 
                lt.company_id = ?
        `;

        const [leaveTypes] = await dbPromise.query(query, [companyId]);
        res.json(leaveTypes);
    } catch (error) {
        console.error('Error in getLeaveTypesByCompanyId:', error);
        res.status(500).json({ error: 'Error fetching leave types for company' });
    }
};

const getLeaveTypesByEmployeeId = async (req, res) => {
    try {
        const { employeeId } = req.query;
        const [employee] = await dbPromise.query(
            'SELECT id, name, manager_id, superior, role, company_id FROM employees WHERE id = ?',
            [employeeId]
        ); 

        const query = `
            SELECT 
                lt.*,
                c.name as company_name,
                c.registration_number,
                COUNT(DISTINCT la.id) as total_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications
            FROM 
                leave_types lt
            LEFT JOIN 
                leave_applications la ON lt.id = la.leave_type_id
            LEFT JOIN 
                companies c ON lt.company_id = c.id
            WHERE 
                lt.company_id = ?
            GROUP BY 
                lt.id
            ORDER BY 
                lt.id
        `;

        const [leaveTypes] = await dbPromise.query(query, [employee[0].company_id]);

        if (leaveTypes.length === 0) {
            return res.status(404).json({ error: 'Leave type not found' });
        }

        res.json(leaveTypes);
    } catch (error) {
        console.error('Error in getLeaveTypeById:', error);
        res.status(500).json({ error: 'Error fetching leave type details' });
    }
};

// Create new leave type
const createLeaveType = async (req, res) => {
    const connection = await dbPromise.getConnection();
    
    try {
        const {
            leave_type_name,
            code,
            description,
            max_days,
            requires_approval,
            requires_documentation,
            is_active,
            company_id,
            is_total,
            total_type,
            is_divident, 
            increment_days, 
            max_increment_days,
            carry_forward_days,
            isNewLeaveType = false
        } = req.body;

        console.log("req.body", req.body);
        console.log("leave_type_name", leave_type_name);

        // Validate required fields
        if (!leave_type_name) {
            return res.status(400).json({
                error: 'Leave type name is required'
            });
        }

        if (!company_id) {
            return res.status(400).json({
                error: 'Company ID is required'
            });
        }

        await connection.beginTransaction();

        const query = `
            INSERT INTO leave_types (
                leave_type_name,
                code,
                description,
                max_days,
                requires_approval,
                requires_documentation,
                is_active,
                company_id,
                is_total,
                total_type,
                is_divident, 
                increment_days, 
                max_increment_days,
                carry_forward_days,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;

        const [result] = await connection.query(query, [
            leave_type_name,
            code,
            description,
            max_days,
            requires_approval,
            requires_documentation,
            is_active,
            company_id,
            is_total,
            total_type,
            is_divident, 
            increment_days, 
            max_increment_days,
            carry_forward_days
        ]);

        if(isNewLeaveType == true){
            const leaveTypeId = result.insertId;
            console.log("leaveTypeId", leaveTypeId);
            const currentYear = new Date().getFullYear();

            // Get all active employees for this company
            const [employees] = await connection.query(`
                SELECT id, joined_date
                FROM employees 
                WHERE company_id = ? 
                AND status = 'Active' 
                AND id != 1
            `, [company_id]);

            console.log(`Found ${employees.length} active employees for company ${company_id}`);

            // Create leave balances for all existing employees
            for (const employee of employees) {
                const joinDate = new Date(employee.joined_date);
                const currentDate = new Date();
                
                // Skip if join date is in the future
                if (joinDate > currentDate) {
                    continue;
                }

                // Calculate initial accrual based on months worked this year
                const yearStart = new Date(currentYear, 0, 1);
                const effectiveStartDate = joinDate > yearStart ? joinDate : yearStart;
                const monthsWorked = Math.max(1, currentDate.getMonth() - effectiveStartDate.getMonth() + 1);
                
                const accrualDays = (max_days / 12) * monthsWorked;
                const totalDays = max_days || 0;
                const remainingDays = totalDays;

                // Insert leave balance for this employee
                await connection.query(`
                    INSERT INTO leave_balances (
                        employee_id,
                        leave_type_id,
                        year,
                        total_days,
                        used_days,
                        remaining_days,
                        accrual_days,
                        accrual_remaining_days,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                `, [
                    employee.id,
                    leaveTypeId,
                    currentYear,
                    totalDays,
                    0,
                    remainingDays,
                    accrualDays,
                    accrualDays
                ]);
            }
        }

        await connection.commit();

        res.status(201).json({
            message: 'Leave type created successfully and leave balances initialized for all employees'
        });
    } catch (error) {
        await connection.rollback();
        console.error('Error in createLeaveType:', error);
        res.status(500).json({ error: 'Error creating leave type' });
    } finally {
        connection.release();
    }
};

// Bulk create leave types
const bulkCreateLeaveTypes = async (req, res) => {
    try {
        const { leaveTypes } = req.body;
        
        if (!Array.isArray(leaveTypes) || leaveTypes.length === 0) {
            return res.status(400).json({ error: 'Invalid input: leaveTypes must be a non-empty array' });
        }
        
        const results = {
            successful: [],
            failed: []
        };
        
        const query = `
            INSERT INTO leave_types (
                leave_type_name,
                code,
                description,
                max_days,
                requires_approval,
                requires_documentation,
                is_active,
                company_id,
                created_at,
                updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `;
        
        for (const leaveType of leaveTypes) {
            const { 
                leave_type_name,
                code,
                description,
                max_days,
                requires_approval,
                requires_documentation,
                is_active,
                company_id
            } = leaveType;
            
            // Validate required fields
            if (!leave_type_name || max_days == null) {
                results.failed.push({ 
                    leave_type_name: leave_type_name || 'Unknown', 
                    error: 'Leave type name and default days are required' 
                });
                continue;
            }
            
            try {
                const [result] = await dbPromise.query(query, [
                    leave_type_name,
                    code || leave_type_name.substring(0, 3).toUpperCase(),
                    description || null,
                    max_days,
                    requires_approval !== undefined ? requires_approval : true,
                    requires_documentation !== undefined ? requires_documentation : false,
                    is_active !== undefined ? is_active : true,
                    company_id
                ]);
                
                results.successful.push({
                    id: result.insertId,
                    leave_type_name
                });
            } catch (error) {
                console.error(`Error creating leave type ${leave_type_name}:`, error);
                results.failed.push({ 
                    leave_type_name, 
                    error: error.message || 'Database error' 
                });
            }
        }
        
        res.status(201).json({
            message: 'Bulk creation completed',
            results: {
                successCount: results.successful.length,
                failureCount: results.failed.length,
                successful: results.successful,
                failed: results.failed
            }
        });
    } catch (error) {
        console.error('Error in bulkCreateLeaveTypes:', error);
        res.status(500).json({ error: 'Error processing bulk creation' });
    }
};

// Update leave type
const updateLeaveType = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            leave_type_name,
            code,
            description,
            max_days,
            requires_approval,
            requires_documentation,
            is_active,
            company_id,
            is_total,
            total_type,
            is_divident, 
            increment_days, 
            max_increment_days,
            carry_forward_days
        } = req.body;

        // Check if leave type exists
        const [existing] = await dbPromise.query(
            'SELECT id FROM leave_types WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Leave type not found' });
        }

        const query = `
            UPDATE leave_types 
            SET 
                leave_type_name = ?,
                code = ?,
                description = ?,
                max_days = ?,
                requires_approval = ?,
                requires_documentation = ?,
                is_active = ?,
                company_id = ?,
                is_total = ?,
                total_type = ?,
                is_divident = ?,
                increment_days = ?,
                max_increment_days = ?,
                carry_forward_days = ?,
                created_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        await dbPromise.query(query, [
            leave_type_name,
            code,
            description,
            max_days,
            requires_approval,
            requires_documentation,
            is_active,
            company_id,
            is_total,
            total_type,
            is_divident, 
            increment_days, 
            max_increment_days,
            carry_forward_days,
            id
        ]);

        res.json({ message: 'Leave type updated successfully' });
    } catch (error) {
        console.error('Error in updateLeaveType:', error);
        res.status(500).json({ error: 'Error updating leave type' });
    }
};

const bulkUpdateLeaveTypes = async (req, res) => {
    try {
        const { leaveTypes } = req.body;
        
        if (!Array.isArray(leaveTypes) || leaveTypes.length === 0) {
            return res.status(400).json({ error: 'Invalid input: leaveTypes must be a non-empty array' });
        }
        
        const results = {
            successful: [],
            failed: []
        };
        
        const query = `
            UPDATE leave_types 
            SET 
                leave_type_name = ?,
                code = ?,
                description = ?,
                max_days = ?,
                requires_approval = ?,
                requires_documentation = ?,
                is_active = ?,
                company_id = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;
        
        for (const leaveType of leaveTypes) {
            const { 
                id, 
                leave_type_name,
                code,
                description,
                max_days,
                requires_approval,
                requires_documentation,
                is_active,
                company_id
            } = leaveType;
            
            if (!id) {
                results.failed.push({ id: null, error: 'Missing leave type ID' });
                continue;
            }
            
            try {
                // Check if leave type exists
                const [existing] = await dbPromise.query(
                    'SELECT id FROM leave_types WHERE id = ?',
                    [id]
                );
                
                if (existing.length === 0) {
                    results.failed.push({ id, error: 'Leave type not found' });
                    continue;
                }
                
                await dbPromise.query(query, [
                    leave_type_name,
                    code,
                    description,
                    max_days,
                    requires_approval,
                    requires_documentation,
                    is_active,
                    company_id,
                    id
                ]);
                
                results.successful.push(id);
            } catch (error) {
                console.error(`Error updating leave type ${id}:`, error);
                results.failed.push({ id, error: error.message });
            }
        }
        
        res.json({
            message: 'Bulk update completed',
            results: {
                successCount: results.successful.length,
                failureCount: results.failed.length,
                successful: results.successful,
                failed: results.failed
            }
        });
    } catch (error) {
        console.error('Error in bulkUpdateLeaveTypes:', error);
        res.status(500).json({ error: 'Error processing bulk update' });
    }
};

// Delete leave type
const deleteLeaveType = async (req, res) => {
    try {
        const { id } = req.params;

        // Check if leave type exists
        const [existing] = await dbPromise.query(
            'SELECT id FROM leave_types WHERE id = ?',
            [id]
        );

        if (existing.length === 0) {
            return res.status(404).json({ error: 'Leave type not found' });
        }

        // Check if leave type is in use
        const [inUse] = await dbPromise.query(
            `SELECT 
                (SELECT COUNT(*) FROM leave_applications WHERE leave_type_id = ?) as applications,
                (SELECT COUNT(*) FROM leave_balances WHERE leave_type_id = ?) as balances
            `,
            [id, id]
        );

        if (inUse[0].applications > 0 || inUse[0].balances > 0) {
            return res.status(400).json({
                error: 'Cannot delete leave type that is in use'
            });
        }

        await dbPromise.query('DELETE FROM leave_types WHERE id = ?', [id]);

        res.json({ message: 'Leave type deleted successfully' });
    } catch (error) {
        console.error('Error in deleteLeaveType:', error);
        res.status(500).json({ error: 'Error deleting leave type' });
    }
};

// Get leave type statistics
const getLeaveTypeStats = async (req, res) => {
    try {
        const { year } = req.query;
        const currentYear = year || new Date().getFullYear();

        const query = `
            SELECT 
                lt.id,
                lt.leave_type_name,
                COUNT(DISTINCT la.id) as total_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'APPROVED' THEN la.id END) as approved_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'REJECTED' THEN la.id END) as rejected_applications,
                COUNT(DISTINCT CASE WHEN la.status = 'PENDING' THEN la.id END) as pending_applications,
                SUM(CASE WHEN la.status = 'APPROVED' THEN la.duration ELSE 0 END) as total_days_approved,
                COUNT(DISTINCT la.employee_id) as unique_employees
            FROM 
                leave_types lt
            LEFT JOIN 
                leave_applications la ON lt.id = la.leave_type_id
                AND YEAR(la.created_at) = ?
            GROUP BY 
                lt.id, lt.leave_type_name
            ORDER BY 
                total_applications DESC
        `;

        const [stats] = await dbPromise.query(query, [currentYear]);
        res.json(stats);
    } catch (error) {
        console.error('Error in getLeaveTypeStats:', error);
        res.status(500).json({ error: 'Error fetching leave type statistics' });
    }
};

const downloadAttachment = async (req, res) => {
    try {
        const { id } = req.params;

        const [document] = await dbPromise.query(
            `SELECT 
                l.employee_id,
                ld.leave_application_id,
                e.name as employee_name,
                d.department_name,
                lt.leave_type_name,
                a1.name as first_approver_name,
                a2.name as second_approver_name,
                ld.document_url,
                ld.document_type,
                ld.file_name
            FROM 
                leave_applications l
            LEFT JOIN 
                employees e ON l.employee_id = e.id
            LEFT JOIN 
                departments d ON e.department_id = d.id
            LEFT JOIN 
                leave_types lt ON l.leave_type_id = lt.id
            LEFT JOIN 
                employees a1 ON l.first_approver_id = a1.id
            LEFT JOIN 
                employees a2 ON l.second_approver_id = a2.id
            LEFT JOIN 
                leave_documents ld ON l.id = ld.leave_application_id
            WHERE ld.leave_application_id = ?`, 
            [id]
        );

        if (document.length === 0) {
            return res.status(404).json({ error: 'No attachment found' });
        }       

        const selectedDocument = document[0];
        const s3 = new AWS.S3();
        const key = `leaves/${selectedDocument.employee_id}/${selectedDocument.leave_application_id}/${selectedDocument.file_name}`;
        const s3Params = {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: key
        };
        s3.getObject(s3Params, function(err, data) {
            if (err === null) {
                res.setHeader('Content-disposition', `attachment; filename=${selectedDocument.leave_application_id}-${selectedDocument.file_name}`)
                res.setHeader('Content-type', selectedDocument.document_type)
                res.send(data.Body);
            } else {
                res.status(500).send(err);
            }
        });  
    } catch (error) {
        console.error('Error in downloadAttachment:', error);
        res.status(500).json({ error: 'Error in downloadAttachment: ' + error });
    }
};

// Generate sample leave applications
const generateSampleLeaves = async (req, res) => {
    try {
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // Get all employee IDs
            const [employees] = await connection.query('SELECT id FROM employees');
            const employeeIds = employees.map(emp => emp.id);

            // Get all leave type IDs
            const [leaveTypes] = await connection.query('SELECT id FROM leave_types');
            const leaveTypeIds = leaveTypes.map(lt => lt.id);

            // Generate 100 sample leave applications
            const leaveApplications = [];
            for (let i = 0; i < 100; i++) {
                const employeeId = employeeIds[Math.floor(Math.random() * employeeIds.length)];
                const leaveTypeId = leaveTypeIds[Math.floor(Math.random() * leaveTypeIds.length)];
                const startDate = new Date();
                startDate.setDate(startDate.getDate() + Math.floor(Math.random() * 365));
                const duration = Math.floor(Math.random() * 14) + 1;
                const endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + duration - 1);

                const reasons = [
                    'Family vacation',
                    'Medical appointment',
                    'Personal emergency',
                    'Educational purposes',
                    'Family event'
                ];
                const reason = reasons[Math.floor(Math.random() * reasons.length)];

                const statuses = ['PENDING', 'APPROVED', 'REJECTED'];
                const status = statuses[Math.floor(Math.random() * statuses.length)];

                const approverId = employeeIds[Math.floor(Math.random() * employeeIds.length)];
                const createdDate = new Date();
                createdDate.setDate(createdDate.getDate() - Math.floor(Math.random() * 30));

                leaveApplications.push([
                    employeeId,
                    leaveTypeId,
                    startDate,
                    endDate,
                    duration,
                    reason,
                    status,
                    status !== 'PENDING' ? approverId : null,
                    status !== 'PENDING' ? new Date() : null,
                    status === 'APPROVED' ? 'Approved as requested' : 
                    status === 'REJECTED' ? 'Rejected due to insufficient coverage' : null,
                    status === 'REJECTED' ? 'Insufficient team coverage' : null,
                    createdDate
                ]);
            }

            // Insert leave applications
            const leaveQuery = `
                INSERT INTO leave_applications 
                (employee_id, leave_type_id, start_date, end_date, duration, reason, 
                status, approver_id, approval_date, approval_comment, rejection_reason, created_at)
                VALUES ?
            `;
            await connection.query(leaveQuery, [leaveApplications]);

            await connection.commit();
            res.status(201).json({ 
                message: 'Sample leave applications generated successfully',
                count: leaveApplications.length
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in generateSampleLeaves:', error);
        res.status(500).json({ error: 'Error generating sample leave applications' });
    }
};

// Update leave application (for PENDING or FIRST_APPROVED status)
const updateLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            leave_type_id,
            start_date,
            end_date,
            reason,
            is_half_day
        } = req.body;

        // Get the leave application
        const [leaves] = await dbPromise.query('SELECT * FROM leave_applications WHERE id = ?', [id]);
        if (leaves.length === 0) {
            return res.status(404).json({ error: 'Leave application not found' });
        }
        const leave = leaves[0];
        if (!(leave.status === 'PENDING' || leave.status === 'FIRST_APPROVED')) {
            return res.status(400).json({ error: 'Only pending or first approved leave requests can be updated' });
        }

        // Calculate new duration
        let duration = calculateBusinessDays(start_date, end_date);

        if (is_half_day) {
            duration = 0.5;
        }

        // Get leave type to check if it's unpaid leave
        const [leaveType] = await dbPromise.query(
            'SELECT * FROM leave_types WHERE id = ?',
            [leave_type_id]
        );

        // Skip balance check for unpaid leave
        if (leaveType[0]?.code !== 'UNPAID') {
            // Check leave balance
            const balanceQuery = `
                SELECT * FROM leave_balances 
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(CURRENT_DATE)
            `;
            const [balances] = await dbPromise.query(balanceQuery, [leave.employee_id, leave_type_id]);
            if (balances.length === 0 || balances[0].remaining_days + leave.duration < duration) {
                // Add back the old duration before checking
                return res.status(400).json({ error: 'Insufficient leave balance for update' });
            }
        }

        // Start transaction
        const connection = await dbPromise.getConnection();
        try {
            // Update leave application
            const updateQuery = `
                UPDATE leave_applications 
                SET leave_type_id = ?, start_date = ?, end_date = ?, duration = ?, reason = ?
                WHERE id = ?
            `;
            await connection.query(updateQuery, [leave_type_id, start_date, end_date, duration, reason, id]);

            // Handle file attachment if present
            if (req.files) {
                // Support both single and multiple attachments[]
                if (req.files['attachments[]']) {
                    attachments = Array.isArray(req.files['attachments[]'])
                      ? req.files['attachments[]']
                      : [req.files['attachments[]']];
                  } else if (req.files.attachments) {
                    attachments = Array.isArray(req.files.attachments)
                      ? req.files.attachments
                      : [req.files.attachments];
                  } else if (req.files.attachment) {
                    attachments = [req.files.attachment];
                  }
                
                  await dbPromise.query(
                    'DELETE FROM leave_documents WHERE leave_application_id = ?',
                    [id]
                );   

                for (const file of attachments) {
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `leaves/${leave.employee_id}/${id}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    const s3 = new AWS.S3({
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        region: process.env.AWS_REGION,
                        signatureVersion: 'v4',
                        endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                    });
                    try {
                        const uploadedData = await s3.upload(fileData).promise();
                        // Save attachment reference in database
                        const attachmentQuery = `INSERT INTO leave_documents 
                            (leave_application_id, document_type, file_name, file_path, file_size, file_type, uploaded_by, document_url) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                        await connection.query(attachmentQuery, [
                            id,
                            file.mimetype,
                            file.name,
                            fileData.Key,
                            file.size,
                            file.mimetype,
                            leave.employee_id,
                            uploadedData.Location
                        ]);
                    } catch (error) {
                        console.error('S3 upload error:', error);
                        throw new Error('Failed to upload file to S3');
                    }
                }
            }

            await connection.commit();
            res.status(200).json({ message: 'Leave application updated successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in updateLeave:', error);
        if (error.message && error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error updating leave application' });
    }
};

// Get leave documents by leave application ID
const getLeaveDocumentsByLeaveApplicationId = async (req, res) => {
    try {
        const { id } = req.params;
        const [documents] = await dbPromise.query(
            'SELECT * FROM leave_documents WHERE leave_application_id = ?',
            [id]
        );
        if (!documents || documents.length === 0) {
            return res.status(404).json({ error: 'No documents found for this leave application' });
        }
        res.json(documents);
    } catch (error) {
        console.error('Error in getLeaveDocumentsByLeaveApplicationId:', error);
        res.status(500).json({ error: 'Error fetching leave documents' });
    }
};

const cancelLeave = async (req, res) => {
    const { id } = req.params;
    const { employee_id } = req.body;

    try {
        // First check if the leave application exists and belongs to the employee
        const [leaveApplication] = await dbPromise.query(
            'SELECT * FROM leave_applications WHERE id = ? AND employee_id = ?',
            [id, employee_id]
        );

        if (!leaveApplication || leaveApplication.length === 0) {
            return res.status(404).json({ message: 'Leave application not found or unauthorized' });
        }

        // Check if the leave application is in a state that can be cancelled
        if (!['PENDING', 'FIRST_APPROVED','APPROVED'].includes(leaveApplication[0].status)) {
            return res.status(400).json({ 
                message: 'Leave application can only be cancelled if it is pending or first approved' 
            });
        }

        // Update the leave application status to CANCELLED
        await dbPromise.query(
            'UPDATE leave_applications SET status = ?, updated_at = NOW() WHERE id = ?',
            ['CANCELLED', id]
        );

        res.status(200).json({ message: 'Leave application cancelled successfully' });
    } catch (error) {
        console.error('Error cancelling leave application:', error);
        res.status(500).json({ message: 'Error cancelling leave application' });
    }
};

const withdrawLeave = async (req, res) => {
    const { id } = req.params;
    const { employee_id } = req.body;

    try {

        // get employee details
        const [employee] = await dbPromise.query(
            'SELECT id, company_id FROM employees WHERE id = ?',
            [employee_id]
        );

        // First check if the leave application exists and belongs to the employee
        const [leaveApplication] = await dbPromise.query(
            'SELECT * FROM leave_applications WHERE id = ? AND employee_id = ?',
            [id, employee_id]
        );

        if (!leaveApplication || leaveApplication.length === 0) {
            return res.status(404).json({ message: 'Leave application not found or unauthorized' });
        }

        // Check if the leave application is in APPROVED status
        if (leaveApplication[0].status !== 'APPROVED') {
            return res.status(400).json({ 
                message: 'Leave application can only be withdrawn if it is approved' 
            });
        }

        try {
            // Update the leave application status to CANCELLED
            await dbPromise.query(
                'UPDATE leave_applications SET status = ?, updated_at = NOW() WHERE id = ?',
                ['CANCELLED', id]
            );

            // Get the leave type and duration for balance recalculation
            const leave = leaveApplication[0];
            const leaveTypeId = leave.leave_type_id;
            const duration = leave.duration;

            console.log(leaveTypeId, duration, employee_id, leave.start_date);

            // Update the leave balance
            const [result] = await dbPromise.query(
                `UPDATE leave_balances 
                SET used_days = used_days - ?, 
                    remaining_days = remaining_days + ?,
                    updated_at = NOW()
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(?)`,
                [duration, duration, employee_id, leaveTypeId, leave.start_date]
            );

            if (result.affectedRows === 0) {
                return res.status(407).json({ error: 'Failed to update leave balance' });
            }

            res.status(200).json({ 
                message: 'Leave application withdrawn successfully',
                details: {
                    leaveId: id,
                    status: 'CANCELLED',
                    duration: duration
                }
            });

        } catch (error) {
            throw error;
        }

    } catch (error) {
        console.error('Error withdrawing leave application:', error);
        res.status(500).json({ 
            message: 'Error withdrawing leave application',
            error: error.message 
        });
    }
};

// Create new leave application
const adminCreateLeave = async (req, res) => {
    try {               
        const {
            admin_id,
            employee_id,
            leave_type_id,
            start_date,
            end_date,
            reason,
            is_half_day
        } = req.body;

        // Calculate duration
        let duration = calculateBusinessDays(start_date, end_date);

        if (is_half_day) {
            duration = 0.5;
        }

        // get employee details
        const [employee] = await dbPromise.query(
            'SELECT * FROM employees WHERE id = ?',
            [employee_id]
        );

        // Get leave type to check if it's unpaid leave
        const [leaveType] = await dbPromise.query(
            'SELECT * FROM leave_types WHERE id = ?',
            [leave_type_id]
        );

        // get employee leave type
        const [employeeLeaveType] = await dbPromise.query(
            'SELECT * FROM leave_types WHERE company_id = ? AND code = ?',
            [employee[0].company_id, leaveType[0].code]
        );

        // Skip balance check for unpaid leave
        if (leaveType[0]?.code !== 'UNPAID') {
            // Check leave balance
            const balanceQuery = `
                SELECT * FROM leave_balances 
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(CURRENT_DATE)
            `;
            
            const [balances] = await dbPromise.query(balanceQuery, [employee_id, employeeLeaveType[0].id]);
            
            if (balances.length === 0 || balances[0].remaining_days < duration) {
                return res.status(400).json({ 
                    error: 'Insufficient leave balance' 
                });
            }
        }

        // Start transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            
            const [employee] = await connection.query(
                'SELECT id, name, manager_id, superior, role, company_id, department_id FROM employees WHERE id = ?',
                [employee_id]
            ); 

            // Create leave application
            const leaveQuery = `
                INSERT INTO leave_applications 
                (employee_id, leave_type_id, start_date, end_date, duration, reason, status, company_id, department_id) 
                VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)
            `;
            
            const [result] = await connection.query(leaveQuery, [
                employee_id,
                employeeLeaveType[0].id,
                start_date,
                end_date,
                duration,
                reason,
                employee[0].company_id,
                employee[0].department_id
            ]);

            const leaveId = result.insertId;

            // Handle multiple file attachments if present
            if (req.files) {
                // Support both single and multiple attachments[]
                if (req.files['attachments[]']) {
                    attachments = Array.isArray(req.files['attachments[]'])
                      ? req.files['attachments[]']
                      : [req.files['attachments[]']];
                  } else if (req.files.attachments) {
                    attachments = Array.isArray(req.files.attachments)
                      ? req.files.attachments
                      : [req.files.attachments];
                  } else if (req.files.attachment) {
                    attachments = [req.files.attachment];
                  }
                  
                for (const file of attachments) {
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `leaves/${employee_id}/${leaveId}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    // Upload to S3
                    const s3 = new AWS.S3({
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        region: process.env.AWS_REGION,
                        signatureVersion: 'v4',
                        endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                    });
                    try {
                        const uploadedData = await s3.upload(fileData).promise();
                        // Save attachment reference in database
                        const attachmentQuery = `INSERT INTO leave_documents 
                            (
                                leave_application_id, 
                                document_type, 
                                file_name, 
                                file_path, 
                                file_size, 
                                file_type, 
                                uploaded_by, 
                                document_url
                            ) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                            `;
                        await connection.query(attachmentQuery, [
                            leaveId,
                            file.mimetype,
                            file.name,
                            fileData.Key,
                            file.size,
                            file.mimetype,
                            employee_id,
                            uploadedData.Location
                        ]);
                    } catch (error) {
                        console.error('S3 upload error:', error);
                        throw new Error('Failed to upload file to S3');
                    }
                }
            }

            // Create leave approval work flow        
            const approvalWorkflowQuery = `
                INSERT INTO leave_approval_workflow 
                (leave_application_id, approver_id, level, status, comments) 
                VALUES (?, ?, 1, 'APPROVAL_REQUIRED', ?)
            `;
            
            if (employee[0] !== null && employee[0].manager_id !== null) {
                await connection.query(approvalWorkflowQuery, [
                    leaveId,
                    employee[0].superior,
                    `New leave request from ${employee[0].name} needs your approval`
                ]);
            }

            await connection.commit();
            res.status(201).json({ 
                message: 'Leave application created successfully',
                leaveId 
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in createLeave:', error);
        if (error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error creating leave application' });
    }
};

// Update leave application (for PENDING or FIRST_APPROVED status)
const adminUpdateLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            leave_type_id,
            start_date,
            end_date,
            reason,
            is_half_day
        } = req.body;

        // Get the leave application
        const [leaves] = await dbPromise.query('SELECT * FROM leave_applications WHERE id = ?', [id]);
        if (leaves.length === 0) {
            return res.status(404).json({ error: 'Leave application not found' });
        }
        const leave = leaves[0];
        if (!(leave.status === 'PENDING' || leave.status === 'FIRST_APPROVED')) {
            return res.status(400).json({ error: 'Only pending or first approved leave requests can be updated' });
        }

        // Calculate new duration
        let duration = calculateBusinessDays(start_date, end_date);

        if (is_half_day) {
            duration = 0.5;
        }

        // Get leave type to check if it's unpaid leave
        const [leaveType] = await dbPromise.query(
            'SELECT * FROM leave_types WHERE id = ?',
            [leave_type_id]
        );

        // Skip balance check for unpaid leave
        if (leaveType[0]?.code !== 'UNPAID') {
            // Check leave balance
            const balanceQuery = `
                SELECT * FROM leave_balances 
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(CURRENT_DATE)
            `;
            const [balances] = await dbPromise.query(balanceQuery, [leave.employee_id, leave_type_id]);
            if (balances.length === 0 || balances[0].remaining_days + leave.duration < duration) {
                // Add back the old duration before checking
                return res.status(400).json({ error: 'Insufficient leave balance for update' });
            }
        }

        // Start transaction
        const connection = await dbPromise.getConnection();
        try {
            // Update leave application
            const updateQuery = `
                UPDATE leave_applications 
                SET leave_type_id = ?, start_date = ?, end_date = ?, duration = ?, reason = ?
                WHERE id = ?
            `;
            await connection.query(updateQuery, [leave_type_id, start_date, end_date, duration, reason, id]);

            // Handle file attachment if present
            if (req.files) {
                // Support both single and multiple attachments[]
                if (req.files['attachments[]']) {
                    attachments = Array.isArray(req.files['attachments[]'])
                      ? req.files['attachments[]']
                      : [req.files['attachments[]']];
                  } else if (req.files.attachments) {
                    attachments = Array.isArray(req.files.attachments)
                      ? req.files.attachments
                      : [req.files.attachments];
                  } else if (req.files.attachment) {
                    attachments = [req.files.attachment];
                  }
                
                  await dbPromise.query(
                    'DELETE FROM leave_documents WHERE leave_application_id = ?',
                    [id]
                );   

                for (const file of attachments) {
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `leaves/${leave.employee_id}/${id}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    const s3 = new AWS.S3({
                        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                        region: process.env.AWS_REGION,
                        signatureVersion: 'v4',
                        endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                    });
                    try {
                        const uploadedData = await s3.upload(fileData).promise();
                        // Save attachment reference in database
                        const attachmentQuery = `INSERT INTO leave_documents 
                            (leave_application_id, document_type, file_name, file_path, file_size, file_type, uploaded_by, document_url) 
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
                        await connection.query(attachmentQuery, [
                            id,
                            file.mimetype,
                            file.name,
                            fileData.Key,
                            file.size,
                            file.mimetype,
                            leave.employee_id,
                            uploadedData.Location
                        ]);
                    } catch (error) {
                        console.error('S3 upload error:', error);
                        throw new Error('Failed to upload file to S3');
                    }
                }
            }

            await connection.commit();
            res.status(200).json({ message: 'Leave application updated successfully' });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in updateLeave:', error);
        if (error.message && error.message.includes('Invalid file type')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Error updating leave application' });
    }
};

const updateLeaveBalanceJobByCompanyId = async (req, res) => {
    const { company_id } = req.params;
    const query = `SELECT 
                e.id as employee_id,
                e.joined_date,
                e.company_id,
                e.department_id
            FROM 
                employees e
            WHERE 
                e.status = 'Active'
                AND e.company_id = ${company_id}
                AND e.id != 1  -- Skip admin account`;
    updateLeaveBalanceDailyJob(query);
    res.status(200).json({ message: 'Leave balance updated successfully' });
};

const updateLeaveBalanceJob = async () => {
    const query = `
            SELECT 
                e.id as employee_id,
                e.joined_date,
                e.company_id,
                e.department_id
            FROM 
                employees e
            WHERE 
                e.status = 'Active'
                AND e.id != 1  -- Skip admin account
        `;
    updateLeaveBalanceDailyJob(query);
};

const updateLeaveBalanceDailyJob = async (query) => {

    console.log('Start scheduled job: Update daily leave balance', new Date());    
    
    const connection = await dbPromise.getConnection();

    try {
        // Get active employees
        const [activeEmployees] = await connection.query(query);        
        console.log(`Found ${activeEmployees.length} active employees`);

        // Get current year and date 
        const currentYear = new Date().getFullYear();
        const currentDate = new Date();
        console.log(`Year is ${currentYear}`);
        console.log(`Today is ${currentDate}`);

        // Check if it's the first day of the year
        const isNewYear = currentDate.getMonth() === 0 && currentDate.getDate() === 1;

        if (isNewYear) {
            console.log(`Today is ${currentDate} and a new year`);
        }

        // Check if today is last day of the month
        const isLastDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate() === currentDate.getDate();

        if (isLastDayOfMonth) {
            console.log(`Today is ${currentDate} and last day of the month`);
        }

        for (const employee of activeEmployees) {
            const joinDate = new Date(employee.joined_date);

            // Skip if join date is in the future
            if (joinDate > currentDate) {
                console.log(`Skipping employee ${employee.employee_id} with join date ${joinDate} - join date is in the future`);
                continue;
            }

            console.log(`Employee ${employee.employee_id} with join date ${joinDate} is active`);

            // Get all active leave types
            const [leaveTypes] = await connection.query(`
                SELECT 
                    id,
                    leave_type_name,
                    code,
                    description,
                    max_days,
                    requires_approval,
                    requires_documentation,
                    is_active,
                    created_at,
                    updated_at,
                    company_id,
                    is_total,
                    total_type,
                    is_divident,
                    increment_days,
                    max_increment_days,
                    carry_forward_days
                FROM 
                    leave_types
                WHERE company_id = ?
                    AND is_active = ?
            `, [employee.company_id, 1]);

            console.log(`Found ${leaveTypes.length} active leave types for company ${employee.company_id} related to employee ${employee.employee_id}`);

            // if new year 
            //  get employee join date, 
            //   if more that 1 year, update leave with increment 
            //   if less than 1 year, update leave
            //  add accrual (carry forward)
            // if last day of the month
            //  update monthly increment for divident leave types 
            for (const leaveType of leaveTypes) {
                // Check if leave balance exists for this employee and leave type
                const [existingBalance] = await connection.query(`
                    SELECT id, used_days, remaining_days, total_days, accrual_days, accrual_remaining_days
                    FROM leave_balances
                    WHERE employee_id = ?
                    AND leave_type_id = ?
                    AND year = ?
                `, [employee.employee_id, leaveType.id, currentYear]);  

                if (existingBalance.length > 0) {
                    console.log(`Employee ${employee.employee_id} has leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
                }
                else {
                    console.log(`Employee ${employee.employee_id} has no leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
                }

                let leaveBalanceId = existingBalance[0] != undefined ? existingBalance[0].id : 0;

                if (isNewYear) {
                    console.log(`Today is new year - updating leave balances for employee ${employee.employee_id}`);

                    // Update balance based on years of service
                    const yearsOfService = currentDate.getFullYear() - joinDate.getFullYear();   
                    
                    // total 
                    const maxDays = leaveType.max_days !== null ? leaveType.max_days : 0;
                    const maxIncrementDays = leaveType.max_increment_days !== null ? leaveType.max_increment_days : 0;
                    const incrementDays = leaveType.increment_days !== null ? leaveType.increment_days : 0;
                    let incrementDaysToAdd = incrementDays;

                    if (yearsOfService > 0) {
                        incrementDaysToAdd = yearsOfService * incrementDays;
                    }
                    
                    // Calculate total days considering max increment limit
                    let totalDays = maxDays + incrementDaysToAdd;
                    if (maxIncrementDays !== 0) {
                        totalDays = Math.min(totalDays, maxIncrementDays);
                    }
                    
                    // Get used days from existing balance
                    const usedDays = existingBalance[0]?.used_days !== undefined ? existingBalance[0].used_days : 0;
                    const remainingDays = totalDays - usedDays;

                    // accrual
                    const accrualDays = totalDays / 12;
                    const newAccrualDays = accrualDays;
                    const newAccrualRemainingDays = existingBalance[0].accrual_remaining_days + accrualDays - usedDays;

                    console.log(`Updating leave balance for employee ${employee.employee_id} for leave type ${leaveType.id}`);
                    console.log(`Years of service: ${yearsOfService}, Increment days: ${leaveType.max_increment_days}`);
                    
                    await connection.query(`
                        UPDATE leave_balances
                        SET 
                            total_days = ?,
                            remaining_days = ?,
                            accrual_days = ?,
                            accrual_remaining_days = ?
                        WHERE id = ?
                    `, [totalDays, remainingDays, newAccrualDays, newAccrualRemainingDays, leaveBalanceId]);
                }
                else if (isLastDayOfMonth) {
                    console.log(`Today is last day of the month - updating monthly leave balances for employee ${employee.employee_id}`);
                    // Regular monthly increment for dividend leave types   
                    const totalDays = existingBalance[0]?.total_days;
                    const remainingDays = totalDays - existingBalance[0]?.used_days;
                    const accrualDays = totalDays / 12;

                    const newAccrualDays = accrualDays;
                    const newAccrualRemainingDays = existingBalance[0].accrual_remaining_days + accrualDays;
                        
                    console.log(`Updating dividend leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}`);
                    
                    await connection.query(`
                        UPDATE leave_balances
                        SET 
                            remaining_days = ?,
                            accrual_days = ?,
                            accrual_remaining_days = ?
                        WHERE id = ?
                    `, [remainingDays, newAccrualDays, newAccrualRemainingDays, leaveBalanceId]);
                }
            }            
        }
        
        await connection.commit();
        console.log('End scheduled job: Update daily leave balance', new Date());
    } catch (error) {
        await connection.rollback();
        console.error('Error in updateLeaveBalanceJobByCompanyId:', error);
    } finally {
        connection.release();
    }
};

// Execute this function when create a new employee
const updateLeaveBalanceByEmployeeId = async (req, res) => {
    const { employee_id } = req.params;
    console.log(`Start update leave balance by employee id ${employee_id}`, new Date());    
    
    const connection = await dbPromise.getConnection();
    
    try {
        await connection.beginTransaction();

        // Get all active employees
        const query = `SELECT 
                e.id as employee_id,
                e.joined_date,
                e.company_id,
                e.department_id
            FROM 
                employees e
            WHERE 
                e.status = 'Active'
                AND e.id = ?
                AND e.id != 1  -- Skip admin account`;
        const [activeEmployees] = await connection.query(query,[employee_id]);
        
        console.log(`Found ${activeEmployees.length} active employees`);
        
        const currentYear = new Date().getFullYear();
        const currentDate = new Date();

        console.log(`Today is ${currentDate}`);
        
        for (const employee of activeEmployees) {
            const joinDate = new Date(employee.joined_date);
            
            // Skip if join date is in the future
            if (joinDate > currentDate) {
                console.log(`Skipping employee ${employee.employee_id} - join date is in the future`);
                continue;
            }
            
            console.log(`Employee ${employee.employee_id} with join date ${joinDate} is active`);
        
            // Get all active leave types
            const [leaveTypes] = await connection.query(`
                SELECT 
                    id,
                    leave_type_name,
                    code,
                    description,
                    max_days,
                    requires_approval,
                    requires_documentation,
                    is_active,
                    created_at,
                    updated_at,
                    company_id,
                    is_total,
                    total_type,
                    is_divident,
                    increment_days,
                    max_increment_days,
                    carry_forward_days
                FROM 
                    leave_types
                WHERE company_id = ?
                    AND is_active = ?
            `, [employee.company_id, 1]);
            
            console.log(`Found ${leaveTypes.length} active leave types for company ${employee.company_id} related to employee ${employee.employee_id}`);
            
            for (const leaveType of leaveTypes) {
                // Check if leave balance exists for this employee and leave type
                const [existingBalance] = await connection.query(`
                    SELECT id, used_days, remaining_days
                    FROM leave_balances
                    WHERE employee_id = ?
                    AND leave_type_id = ?
                    AND year = ?
                `, [employee.employee_id, leaveType.id, currentYear]);  

                if (existingBalance.length > 0) {
                    console.log(`Employee ${employee.employee_id} has leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
                    console.log(existingBalance);
                }
                else {
                    console.log(`Employee ${employee.employee_id} has no leave balance for leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
                }

                let leaveBalanceId = existingBalance[0] != undefined ? existingBalance[0].id : 0;
                if (existingBalance.length === 0) {
                    // Create new leave balance
                    console.log(`Creating new leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}`);

                    const accrualDays = leaveType.max_days / 12;
                    const newAccrualDays = accrualDays;
                    
                    await connection.query(`
                        INSERT INTO leave_balances (
                            employee_id,
                            leave_type_id,
                            year,
                            total_days,
                            used_days,
                            remaining_days,
                            accrual_days,
                            accrual_remaining_days
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    `, [
                        employee.employee_id,
                        leaveType.id,
                        currentYear,
                        leaveType.max_days,
                        0,
                        0,
                        newAccrualDays,
                        0
                    ]);

                    // Get the newly inserted ID
                    const [newId] = await connection.query('SELECT LAST_INSERT_ID() as id');
                    leaveBalanceId = newId[0].id;
                    console.log(`Inserted leave balance for employee ${employee.employee_id}, leave type ${leaveType.id}-${leaveType.leave_type_name} and year ${currentYear}`);
                }
            }
        }
        
        await connection.commit();
        console.log('End scheduled job: Update daily leave balance', new Date());
        res.status(200).json({ message: 'Leave balance updated successfully for employee id ' + employee_id });
    } catch (error) {
        await connection.rollback();
        console.error('Error in updateLeaveBalanceJobByCompanyId:', error);
    } finally {
        connection.release();
    }
};

// Reject specific days from approved leave
const rejectApprovedLeave = async (req, res) => {
    try {
        const { id } = req.params;
        const { approver_id, reason, dates_to_reject } = req.body;

        if (!dates_to_reject || dates_to_reject.length === 0) {
            return res.status(400).json({ error: 'Please select at least one date to reject' });
        }

        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // Get leave application details
            const [leaves] = await connection.query(
                'SELECT * FROM leave_applications WHERE id = ?',
                [id]
            );

            if (leaves.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: 'Leave application not found' });
            }

            const leave = leaves[0];

            if (leave.status !== 'APPROVED') {
                await connection.rollback();
                return res.status(400).json({ 
                    error: 'Only approved leaves can be partially rejected' 
                });
            }

            // Calculate rejected days count
            const rejectedDaysCount = dates_to_reject.length;

            // Update leave balance - restore rejected days
            await connection.query(
                `UPDATE leave_balances 
                SET used_days = used_days - ?, 
                    remaining_days = remaining_days + ?,
                    accrual_remaining_days = accrual_remaining_days + ?
                WHERE employee_id = ? 
                AND leave_type_id = ? 
                AND year = YEAR(CURRENT_DATE)`,
                [rejectedDaysCount, rejectedDaysCount, rejectedDaysCount, leave.employee_id, leave.leave_type_id]
            );

            // Calculate new duration for the leave application
            const originalDaysArray = [];
            for (let dt = new Date(leave.start_date); dt <= new Date(leave.end_date); dt.setDate(dt.getDate() + 1)) {
                originalDaysArray.push(new Date(dt).toISOString().split('T')[0]);
            }

            const remainingDays = originalDaysArray.filter(date => !dates_to_reject.includes(date));
            const newDuration = leave.duration - rejectedDaysCount;

            if (remainingDays.length === 0) {
                // If all days are rejected, change status to REJECTED
                await connection.query(
                    `UPDATE leave_applications 
                    SET status = 'REJECTED',
                        duration = 0,
                        rejection_reason = ?,
                        rejection_date = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                    [`All leave days rejected: ${reason}`, id]
                );
            } else {
                // Update duration for partial rejection
                await connection.query(
                    `UPDATE leave_applications 
                    SET duration = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?`,
                    [newDuration, id]
                );
            }

            // Create rejection history
            await connection.query(
                `INSERT INTO leave_history 
                (leave_application_id, action_type, action_by, previous_status, new_status, comments) 
                VALUES (?, 'PARTIAL_REJECTION', ?, 'APPROVED', ?, ?)`,
                [id, approver_id, remainingDays.length === 0 ? 'REJECTED' : 'APPROVED', 
                 `Rejected ${rejectedDaysCount} day(s): ${dates_to_reject.join(', ')}. Reason: ${reason}`]
            );

            // Create leave approval workflow entry
            const [employee] = await connection.query(
                'SELECT name FROM employees WHERE id = ?',
                [leave.employee_id]
            );
            
            const approvalWorkflowQuery = `
                INSERT INTO leave_approval_workflow 
                (leave_application_id, approver_id, level, status, comments) 
                VALUES (?, ?, 0, 'PARTIAL_REJECTION', ?)
            `;
            
            await connection.query(approvalWorkflowQuery, [
                id,
                approver_id,
                `Partial rejection of approved leave for ${employee[0].name}. Rejected dates: ${dates_to_reject.join(', ')}`
            ]);

            await connection.commit();
            res.json({ 
                message: `Successfully rejected ${rejectedDaysCount} day(s) from approved leave`,
                rejected_days: rejectedDaysCount,
                remaining_duration: newDuration
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Error in rejectApprovedLeave:', error);
        res.status(500).json({ error: 'Error rejecting approved leave days' });
    }
};

const calculateBusinessDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    let count = 0;
    const current = new Date(start);

    while (current <= end) {
        // Skip weekends (0 = Sunday, 6 = Saturday)
        if (current.getDay() !== 0 && current.getDay() !== 6) {
            count++;
        }
        current.setDate(current.getDate() + 1);
    }
    return count;
};

const getLeaveHistoryRange1 = async (req, res) => {
  try {
    // treat '', 'undefined', 'null' as missing
    const norm = (v) => (v && v !== 'undefined' && v !== 'null' ? String(v) : null);

    let startDate = norm(req.query.startDate);
    let endDate   = norm(req.query.endDate);
    const employeeIds = norm(req.query.employeeIds);
    const departmentId = norm(req.query.departmentId);
    const companyId = norm(req.query.companyId);
    const status = norm(req.query.status);

    // Default to current month if either bound missing
    if (!startDate || !endDate) {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth(); // 0-11
      const first = new Date(y, m, 1);
      const last  = new Date(y, m + 1, 0);
      const fmt = (d) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      startDate = startDate || fmt(first);
      endDate   = endDate   || fmt(last);
    }

    const params = [startDate, endDate];
    // Robust overlap: NOT (leave ends before window starts OR leave starts after window ends)
    let where = `NOT (l.end_date < ? OR l.start_date > ?)`;

    if (status) {
      where += ` AND l.status = ?`;
      params.push(status);
    }

    if (employeeIds) {
      const ids = employeeIds.split(',').map(s => s.trim()).filter(Boolean);
      if (ids.length) {
        where += ` AND l.employee_id IN (${ids.map(() => '?').join(',')})`;
        params.push(...ids);
      }
    }

    if (departmentId) {
      where += ` AND e.department_id = ?`;
      params.push(departmentId);
    }

    if (companyId) {
      where += ` AND e.company_id = ?`;
      params.push(companyId);
    }

    const sql = `
      SELECT
        l.id,
        l.employee_id,
        e.name                AS employee_name,
        c.name                AS company_name,
        d.department_name,
        lt.leave_type_name,
        l.status,
        DATE_FORMAT(l.start_date, '%Y-%m-%d') AS start_date,
        DATE_FORMAT(l.end_date,   '%Y-%m-%d') AS end_date,
        l.duration,
        CASE
          WHEN l.duration = 0.5
               OR (DATEDIFF(l.end_date, l.start_date) = 0 AND l.duration > 0 AND l.duration < 1)
            THEN 1 ELSE 0
        END AS is_half_day
      FROM leave_applications l
      JOIN employees   e ON e.id = l.employee_id
      LEFT JOIN companies   c ON c.id = e.company_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
      WHERE ${where}
      ORDER BY e.name ASC, l.start_date ASC, l.id ASC
    `;

    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('getLeaveHistoryRange error', err);
    res.status(500).json({ error: 'Error fetching leave history' });
  }
};

// controller
const getLeaveHistoryRange = async (req, res) => {
  try {
    const norm = (v) => (v && v !== 'undefined' && v !== 'null' ? String(v) : null);

    let startDate = norm(req.query.startDate);
    let endDate   = norm(req.query.endDate);
    const employeeIds = norm(req.query.employeeIds);
    const departmentId = norm(req.query.departmentId);
    const companyId = norm(req.query.companyId);
    const status = norm(req.query.status);

    if (!startDate || !endDate) {
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      startDate = startDate || fmt(new Date(y, m, 1));
      endDate   = endDate   || fmt(new Date(y, m + 1, 0));
    }

    const params = [startDate, endDate];
    let where = `NOT (l.end_date < ? OR l.start_date > ?)`;

    if (status) { where += ` AND l.status = ?`; params.push(status); }

    if (employeeIds) {
      const ids = employeeIds.split(',').map(s => s.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n));
      if (ids.length) {
        where += ` AND l.employee_id IN (${ids.map(()=>'?').join(',')})`;
        params.push(...ids);
      }
    }

    if (departmentId) { where += ` AND e.department_id = ?`; params.push(departmentId); }
    if (companyId)    { where += ` AND e.company_id = ?`;    params.push(companyId);    }

    const sql = `
      SELECT
        l.id, l.employee_id,
        e.name AS employee_name,
        c.name AS company_name,
        d.department_name,
        lt.leave_type_name,
        l.status,
        DATE_FORMAT(l.start_date,'%Y-%m-%d') AS start_date,
        DATE_FORMAT(l.end_date,  '%Y-%m-%d') AS end_date,
        l.duration,
        CASE
          WHEN l.duration = 0.5
               OR (DATEDIFF(l.end_date,l.start_date)=0 AND l.duration > 0 AND l.duration < 1)
          THEN 1 ELSE 0
        END AS is_half_day
      FROM leave_applications l
      JOIN employees   e ON e.id = l.employee_id
      LEFT JOIN companies   c ON c.id = e.company_id
      LEFT JOIN departments d ON d.id = e.department_id
      LEFT JOIN leave_types lt ON lt.id = l.leave_type_id
      WHERE ${where}
      ORDER BY e.name ASC, l.start_date ASC, l.id ASC
    `;
    const [rows] = await dbPromise.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('getLeaveHistoryRange error', err);
    res.status(500).json({ error: 'Error fetching leave history' });
  }
};



module.exports = {
    getAllLeaves,
    getAllLeavesByEmployeeId,
    getRecentLeaves,
    getLeaveById,
    createLeave,
    approveLeave,
    rejectLeave,
    rejectApprovedLeave,
    getLeaveBalance,
    getLeaveCalendar,
    getLeaveNotifications,
    updateNotificationStatus,
    uploadLeaveDocuments,
    getLeaveDocuments,
    getAllLeaveTypes,
    getLeaveTypeById,
    getLeaveTypesByCompanyId,
    getLeaveTypesByEmployeeId,
    createLeaveType,
    updateLeaveType,
    deleteLeaveType,
    getLeaveTypeStats,
    downloadAttachment,
    generateSampleLeaves,
    bulkUpdateLeaveTypes,
    bulkCreateLeaveTypes,
    updateLeave,
    getLeaveDocumentsByLeaveApplicationId,
    cancelLeave,
    getLeavesForCalendarByEmployeeId,
    adminCreateLeave,
    adminUpdateLeave,
    updateLeaveBalanceJob,
    updateLeaveBalanceJobByCompanyId,
    updateLeaveBalanceByEmployeeId,
    withdrawLeave,
    getLeaveHistoryRange
};
