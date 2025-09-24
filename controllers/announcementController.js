// const { dbPromise } = require('../models/db');
// const jwt = require('jsonwebtoken');
// const AWS = require('aws-sdk');


// // Announcements
// const createAnnouncement = async (req, res) => {
//     try {
//         // Check if data comes as JSON string in FormData or direct JSON
//         let announcementData;
//         if (req.body.data) {
//             // Parse data from FormData
//             announcementData = JSON.parse(req.body.data);
//         } else {
//             // Use raw JSON body
//             announcementData = req.body;
//         }
        
//         const { 
//             title, 
//             content, 
//             targets, 
//             target_all = false, 
//             is_posted = false, 
//             is_acknowledgement = false, 
//             is_force_login = false, 
//             scheduled_at = null,
//             is_expired = false
//         } = announcementData;
        
//         // Validate required fields
//         if (!title || !content) {
//             return res.status(400).json({ error: "Title and content are required fields" });
//         }

//         // Start a transaction since we need to add records to multiple tables
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
//             // Insert the announcement
//             const insertQuery = `
//                 INSERT INTO announcements (title, content, target_all, is_posted, is_active, is_acknowledgement, is_force_login, is_expired, scheduled_at, created_at)
//                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NOW())
//             `;

//             // If no specific targets and target_all is not explicitly set to true,
//             // default to targeting everyone
//             const isTargetAll = target_all || (!targets || targets.length === 0);
            
//             // If scheduled_at is provided, set is_posted to 0, it will be posted automatically when scheduled
//             const willBePosted = scheduled_at ? 0 : is_posted ? 1 : 0;
            
//             const [result] = await connection.query(insertQuery, [
//                 title, 
//                 content, 
//                 isTargetAll ? 1 : 0, 
//                 willBePosted, 
//                 is_acknowledgement ? 1 : 0, 
//                 is_force_login ? 1 : 0,
//                 is_expired ? 1 : 0,
//                 scheduled_at,
//             ]);
            
//             const announcementId = result.insertId;
            
//             console.log("targets", targets);
//             // If specific targets are provided, add them to the appropriate tables
//             if (targets && targets.length > 0 && !isTargetAll) {
//                 const companyTargets = targets.filter(t => t.target_type === 'company').map(t => t.target_id);
//                 const departmentTargets = targets.filter(t => t.target_type === 'department').map(t => t.target_id);
//                 const positionTargets = targets.filter(t => t.target_type === 'position').map(t => t.target_id);
//                 const employeeTargets = targets.filter(t => t.target_type === 'employee').map(t => t.target_id);

//                 // Add employee targets
//                 if (employeeTargets.length > 0) {
//                     for (const employeeId of employeeTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_employees (announcement_id, employee_id) VALUES (?, ?)',
//                             [announcementId, employeeId]
//                         );
//                     }
//                 }
//                 // Add position targets
//                 else if (positionTargets.length > 0) {
//                     for (const positionId of positionTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_positions (announcement_id, position_id) VALUES (?, ?)',
//                             [announcementId, positionId]
//                         );
//                     }
//                 }
//                 else if (departmentTargets.length > 0) {
//                     for (const departmentId of departmentTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_departments (announcement_id, department_id) VALUES (?, ?)',
//                             [announcementId, departmentId]
//                         );
//                     }
//                 }
//                 else if (companyTargets.length > 0) {
//                     for (const companyId of companyTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_companies (announcement_id, company_id) VALUES (?, ?)',
//                             [announcementId, companyId]
//                         );
//                     }
//                 }
                
//             }
            
//             // Handle document uploads if files are included
//             const uploadedDocuments = [];
            
//             if (req.files) {
//                 // Configure AWS S3
//                 const s3 = new AWS.S3({
//                     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                     region: process.env.AWS_REGION,
//                     signatureVersion: 'v4',
//                     endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                 });
                
//                 // Support different ways files might be submitted
//                 let attachments = [];
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                         ? req.files['attachments[]']
//                         : [req.files['attachments[]']];
//                 } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                         ? req.files.attachments
//                         : [req.files.attachments];
//                 } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                 } else {
//                     // Get first file if no specific field is used
//                     attachments = [Object.values(req.files)[0]];
//                 }
                
//                 for (const file of attachments) {
//                     // Prepare file data for S3
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `announcements/${announcementId}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
                    
//                     try {
//                         // Upload to S3
//                         const uploadedData = await s3.upload(fileData).promise();
                        
//                         // Save document reference in database
//                         const insertDocQuery = `
//                             INSERT INTO announcement_documents (
//                                 announcement_id, 
//                                 document_type, 
//                                 s3_key, 
//                                 original_filename, 
//                                 file_size, 
//                                 content_type
//                             ) VALUES (?, ?, ?, ?, ?, ?)
//                         `;
                        
//                         const [docResult] = await connection.query(insertDocQuery, [
//                             announcementId,
//                             file.mimetype,
//                             fileData.Key,
//                             file.name,
//                             file.size,
//                             file.mimetype
//                         ]);
                        
//                         uploadedDocuments.push({
//                             id: docResult.insertId,
//                             filename: file.name,
//                             url: uploadedData.Location
//                         });
//                     } catch (error) {
//                         console.error(`Error uploading file ${file.name} to S3:`, error);
//                         // Continue with other files even if one fails
//                     }
//                 }
//             }

//             // Commit the transaction
//             await connection.commit();

//             res.status(201).json({
//                 message: "Announcement created successfully",
//                 announcement_id: announcementId,
//                 scheduled: scheduled_at ? true : false,
//                 documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
//             });
//         } catch (error) {
//                 // Rollback in case of error
//                 await connection.rollback();
//                 throw error;
//             } finally {
//                 connection.release();
//             }
//     } catch (error) {
//         console.error("Error creating announcement:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// const getAllAnnouncements = async (req, res) => {
//     try {
        
//         // Get employee ID from request if available (for read status)
//         const empId = req.query.employee_id || null;

//         // Check if employee exists if ID provided
//         if (empId) {
//             const [empCheck] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [empId]);
//             if (empCheck.length === 0) {
//                 return res.status(404).json({ error: "Employee not found" });
//             }
//         }

//         // Improved query with proper parameter binding and structure
//         const query = `
//             SELECT 
//                 a.id,
//                 a.title,
//                 a.content,
//                 a.created_at,
//                 a.target_all,
//                 a.is_active,
//                 a.is_posted,
//                 a.is_acknowledgement,
//                 a.is_force_login,
//                 a.scheduled_at,
//                 a.updated_at,
//                 ar.is_read,
//                 (SELECT e.name FROM announcement_employees ae JOIN employees e ON ae.employee_id = e.id WHERE ae.announcement_id = a.id LIMIT 1) AS target_employees,
//                 (SELECT p.title FROM announcement_positions ap JOIN positions p ON ap.position_id = p.id WHERE ap.announcement_id = a.id LIMIT 1) AS target_positions,
//                 (SELECT d.department_name FROM announcement_departments ad JOIN departments d ON ad.department_id = d.id WHERE ad.announcement_id = a.id LIMIT 1) AS target_departments,
//                 (SELECT c.name FROM announcement_companies ac JOIN companies c ON ac.company_id = c.id WHERE ac.announcement_id = a.id LIMIT 1) AS target_companies,
//                 COALESCE(ar.read_at, 'Unread') AS read_status
//             FROM 
//                 announcements a
//             /* Read status join - only relevant if employee ID is provided */
//             LEFT JOIN
//                 announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
//             /* Join announcement targeting tables */
//             LEFT JOIN 
//                 announcement_companies ac ON ac.announcement_id = a.id
//             LEFT JOIN 
//                 announcement_departments ad ON ad.announcement_id = a.id
//             LEFT JOIN 
//                 announcement_positions ap ON ap.announcement_id = a.id
//             LEFT JOIN 
//                 announcement_employees ae ON ae.announcement_id = a.id
//             /* Join employee table if employee ID is provided */
//             ${empId ? 'JOIN employees e ON e.id = ?' : ''}
//             /* Filter based on targeting conditions only if employee ID is provided */
//             ${empId ? 'WHERE a.is_posted = 1 AND a.is_active = 1 AND a.is_delete = 0 AND (a.target_all = 1 OR ac.company_id = e.company_id OR ad.department_id = e.department_id OR ap.position_id = e.position_id OR ae.employee_id = e.id)' : 'WHERE a.is_delete = 0'}
//             GROUP BY a.id
//             ORDER BY a.created_at DESC
//         `;

//         // Prepare parameters based on whether empId is provided
//         const params = empId ? [empId, empId] : [null];

//         const [announcements] = await dbPromise.query(query, params);

//         res.json(announcements
//             .map(announcement => ({
//                 ...announcement,
//                 target_type: announcement.target_employees ? 'employee' :
//                             announcement.target_positions ? 'position' :
//                             announcement.target_departments ? 'department' :
//                             announcement.target_companies ? 'company' : 'all',
//                 target_name: announcement.target_employees ? announcement.target_employees :
//                             announcement.target_positions ? announcement.target_positions :
//                             announcement.target_departments ? announcement.target_departments :
//                             announcement.target_companies ? announcement.target_companies : 'all'
//             }))
//         );
//     } catch (error) {
//         console.error("Error fetching announcements:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// const getAnnouncementById = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const empId = req.query.employee_id || null;

//         // Basic announcement query without targeting restrictions
//         let query = `
//             SELECT 
//                 a.id,
//                 a.title,
//                 a.content,
//                 a.created_at,
//                 a.target_all,
//                 a.is_active,
//                 a.is_posted,
//                 a.scheduled_at
//             FROM 
//                 announcements a
//             WHERE a.id = ?
//         `;

//         // If employee ID is provided, also get read status
//         if (empId) {
//             query = `
//                 SELECT 
//                     a.id,
//                     a.title,
//                     a.content,
//                     a.created_at,
//                     a.target_all,
//                     a.is_active,
//                     COALESCE(ar.read_at, 'Unread') AS read_status
//                 FROM 
//                     announcements a
//                 LEFT JOIN 
//                     announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
//                 WHERE a.id = ?
//             `;
//         }

//         const [announcements] = await dbPromise.query(
//             query,
//             empId ? [empId, id] : [id]
//         );

//         if (announcements.length === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }

//         // Get targeting information - which companies, departments, positions and employees
//         const [targetCompanies] = await dbPromise.query(
//             `SELECT c.id, c.name FROM announcement_companies ac 
//              JOIN companies c ON ac.company_id = c.id 
//              WHERE ac.announcement_id = ?`,
//             [id]
//         );

//         const [targetDepartments] = await dbPromise.query(
//             `SELECT d.id, d.department_name, d.company_id, c.name AS company_name FROM announcement_departments ad 
//              JOIN departments d ON ad.department_id = d.id 
//              JOIN companies c ON d.company_id = c.id
//              WHERE ad.announcement_id = ?`,
//             [id]
//         );

//         const [targetPositions] = await dbPromise.query(
//             `SELECT p.id, p.title, d.department_name, c.name AS company_name FROM announcement_positions ap
//             JOIN positions p ON ap.position_id = p.id
//             JOIN departments d ON p.department_id = d.id
//             JOIN companies c ON d.company_id = c.id
//             WHERE ap.announcement_id = ?`,
//             [id]
//         );

//         const [targetEmployees] = await dbPromise.query(
//             `SELECT e.id, e.name, p.title AS position_title, p.job_level, d.department_name, c.name AS company_name FROM announcement_employees ae 
//              JOIN employees e ON ae.employee_id = e.id
//              JOIN positions p ON e.position_id = p.id
//              JOIN departments d ON e.department_id = d.id
//              JOIN companies c ON d.company_id = c.id
//              WHERE ae.announcement_id = ?`,
//             [id]
//         );

//         // Build a complete response
//         const response = {
//             ...announcements[0],
//             is_posted: announcements[0].is_posted === 0 ? false : true,
//             scheduled_at: announcements[0].scheduled_at,
//             targets: {
//                 companies: targetCompanies.map(company => ({
//                     id: company.id,
//                     name: company.name
//                 })) ,
//                 departments: targetDepartments.map(department => ({
//                     id: department.id,
//                     name: department.department_name,
//                     company_name: department.company_name
//                 })),
//                 positions: targetPositions.map(position => ({
//                     id: position.id,
//                     name: position.title,
//                     department_name: position.department_name,
//                     company_name: position.company_name
//                 })),
//                 employees: targetEmployees.map(employee => ({
//                     id: employee.id,
//                     name: employee.name,
//                     position_title: employee.position_title,
//                     job_level: employee.job_level,
//                     department_name: employee.department_name,
//                     company_name: employee.company_name
//                 }))
//             }
//         };

//         res.json(response);
//     } catch (error) {
//         console.error("Error fetching announcement:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// const updateAnnouncement = async (req, res) => {
//     try {
//         const { id } = req.params;
        
//         // Check if data comes as JSON string in FormData or direct JSON
//         let announcementData;
//         if (req.body.data) {
//             // Parse data from FormData
//             announcementData = JSON.parse(req.body.data);
//         } else {
//             // Use raw JSON body
//             announcementData = req.body;
//         }
        
//         const { 
//             title, 
//             content, 
//             targets, 
//             target_all = false, 
//             is_posted = false, 
//             scheduled_at = null 
//         } = announcementData;

//         // Validate required fields
//         if (!title || !content) {
//             return res.status(400).json({ error: "Title and content are required fields" });
//         }

//         // Start a transaction
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();

//         try {
//             // If scheduled_at is provided, set is_posted to 0, it will be posted automatically when scheduled
//             const willBePosted = scheduled_at ? 0 : is_posted ? 1 : 0;

//             // First, check if the announcement exists
//             const [checkResult] = await connection.query(
//                 'SELECT id FROM announcements WHERE id = ?',
//                 [id]
//             );

//             if (checkResult.length === 0) {
//                 await connection.rollback();
//                 return res.status(404).json({ error: "Announcement not found" });
//             }

//             // Update announcement basic info
//             const isTargetAll = target_all || (!targets || targets.length === 0);

//             await connection.query(
//                 'UPDATE announcements SET title = ?, content = ?, target_all = ?, is_posted = ?, scheduled_at = ? WHERE id = ?',
//                 [title, content, isTargetAll ? 1 : 0, willBePosted, scheduled_at, id]
//             );

//             // Clear all existing targets
//             await connection.query('DELETE FROM announcement_companies WHERE announcement_id = ?', [id]);
//             await connection.query('DELETE FROM announcement_departments WHERE announcement_id = ?', [id]);
//             await connection.query('DELETE FROM announcement_positions WHERE announcement_id = ?', [id]);
//             await connection.query('DELETE FROM announcement_employees WHERE announcement_id = ?', [id]);

//             // If specific targets are provided, add them to the appropriate tables
//             if (targets && targets.length > 0 && !isTargetAll) {
//                 const companyTargets = targets.filter(t => t.type === 'company').map(t => t.id);
//                 const departmentTargets = targets.filter(t => t.type === 'department').map(t => t.id);
//                 const positionTargets = targets.filter(t => t.type === 'position').map(t => t.id);
//                 const employeeTargets = targets.filter(t => t.type === 'employee').map(t => t.id);

//                 // Add company targets
//                 if (companyTargets.length > 0) {
//                     for (const companyId of companyTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_companies (announcement_id, company_id) VALUES (?, ?)',
//                             [id, companyId]
//                         );
//                     }
//                 }

//                 // Add department targets
//                 if (departmentTargets.length > 0) {
//                     for (const departmentId of departmentTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_departments (announcement_id, department_id) VALUES (?, ?)',
//                             [id, departmentId]
//                         );
//                     }
//                 }

//                 // Add position targets
//                 if (positionTargets.length > 0) {
//                     for (const positionId of positionTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_positions (announcement_id, position_id) VALUES (?, ?)',
//                             [id, positionId]
//                         );
//                     }
//                 }

//                 // Add employee targets
//                 if (employeeTargets.length > 0) {
//                     for (const employeeId of employeeTargets) {
//                         await connection.query(
//                             'INSERT INTO announcement_employees (announcement_id, employee_id) VALUES (?, ?)',
//                             [id, employeeId]
//                         );
//                     }
//                 }
//             }
            
//             // Handle document uploads if files are included
//             const uploadedDocuments = [];
//             if (req.files) {
//                 // Configure AWS S3
//                 const s3 = new AWS.S3({
//                     accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                     secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                     region: process.env.AWS_REGION,
//                     signatureVersion: 'v4',
//                     endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//                 });
                
//                 // Support different ways files might be submitted
//                 let attachments = [];
//                 if (req.files['attachments[]']) {
//                     attachments = Array.isArray(req.files['attachments[]'])
//                         ? req.files['attachments[]']
//                         : [req.files['attachments[]']];
//                 } else if (req.files.attachments) {
//                     attachments = Array.isArray(req.files.attachments)
//                         ? req.files.attachments
//                         : [req.files.attachments];
//                 } else if (req.files.attachment) {
//                     attachments = [req.files.attachment];
//                 } else {
//                     // Get first file if no specific field is used
//                     attachments = [Object.values(req.files)[0]];
//                 }
                
//                 for (const file of attachments) {
//                     // Prepare file data for S3
//                     const fileData = {
//                         Bucket: process.env.AWS_BUCKET_NAME,
//                         Key: `announcements/${id}/${file.name}`,
//                         Body: file.data,
//                         ContentType: file.mimetype,
//                         Size: file.size
//                     };
                    
//                     try {
//                         // Upload to S3
//                         const uploadedData = await s3.upload(fileData).promise();
                        
//                         // Save document reference in database
//                         const insertDocQuery = `
//                             INSERT INTO announcement_documents (
//                                 announcement_id, 
//                                 document_type, 
//                                 s3_key, 
//                                 original_filename, 
//                                 file_size, 
//                                 content_type
//                             ) VALUES (?, ?, ?, ?, ?, ?)
//                         `;
                        
//                         const [docResult] = await connection.query(insertDocQuery, [
//                             id,
//                             file.mimetype,
//                             fileData.Key,
//                             file.name,
//                             file.size,
//                             file.mimetype
//                         ]);
                        
//                         uploadedDocuments.push({
//                             id: docResult.insertId,
//                             filename: file.name,
//                             url: uploadedData.Location
//                         });
//                     } catch (error) {
//                         console.error(`Error uploading file ${file.name} to S3:`, error);
//                         // Continue with other files even if one fails
//                     }
//                 }
//             }

//             // Commit the transaction
//             await connection.commit();

//             res.json({ 
//                 message: "Announcement updated successfully",
//                 announcement_id: id,
//                 scheduled: scheduled_at ? true : false,
//                 documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
//              });
//         } catch (error) {
//             // Rollback in case of error
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error("Error updating announcement:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// const patchAnnouncement = async (req, res) => {
//     try {
//         const { id } = req.params;
//         const { is_active } = req.body;

//         const query = `UPDATE announcements SET is_active = ? WHERE id = ?`;
//         const [result] = await dbPromise.query(query, [is_active, id]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }

//         res.json({ message: "Announcement updated successfully" });
//     }
//     catch (error) {
//         console.error("Error patching announcement:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// }

// const deleteAnnouncement = async (req, res) => {
//     try {
//         const { id } = req.params;

//         // Delete announcement
//         const query = `DELETE FROM announcements WHERE id = ?`;

//         const [result] = await dbPromise.query(query, [id]);

//         if (result.affectedRows === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }

//         res.json({ message: "Announcement deleted successfully" });
//     } catch (error) {
//         console.error("Error deleting announcement:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// const updateAnnouncementRead = async (req, res) => {
//     try {
//         const { announcement_id, employee_id, is_read} = req.body;

//         const checkQuery = `SELECT * FROM announcement_reads WHERE announcement_id = ? AND employee_id = ? AND is_read = 0`;
//         const [existing] = await dbPromise.query(checkQuery, [announcement_id, employee_id]);

//         let result;
//         if(existing.length > 0){
//             const query = `UPDATE announcement_reads SET is_read = ?, read_at = ? WHERE announcement_id = ? AND employee_id = ?`;
//             [result] = await dbPromise.query(query, [is_read, is_read ? new Date() : null, announcement_id, employee_id]);
//         }
//         else{
//             const query = `INSERT INTO announcement_reads (announcement_id, employee_id, is_read, read_at) VALUES (?, ?, ?, ?)`;    
//             [result] = await dbPromise.query(query, [announcement_id, employee_id, is_read, is_read ? new Date() : null]);
//         }

//         if (result.affectedRows === 0) {
//             console.log("Announcement not found");
//             return res.status(404).json({ error: "Announcement not found" });
//         }

//         res.json({ message: "Announcement read successfully" });
//     }
//     catch (error) {
//         console.error("Error patching announcement read:", error);
//         res.status(500).json({ error: "Internal server error" });
//     }
// };

// // Add a new function to publish scheduled announcements
// const publishScheduledAnnouncements = async () => {
//     try {
//         // Create date in GMT+8 timezone to match submission timezone
//         const now = new Date();
//         // Add 8 hours to match GMT+8
//         now.setHours(now.getHours() + 8);
//         const currentDate = now.toISOString().slice(0, 19).replace('T', ' ');
        
//         console.log("Current Date (GMT+8): ", currentDate);
        
//         const [pendingAnnouncements] = await dbPromise.query(
//             `SELECT id, scheduled_at FROM announcements 
//              WHERE scheduled_at IS NOT NULL 
//              AND scheduled_at <= ? 
//              AND is_posted = 0`,
//             [currentDate]
//         );
        
//         if (pendingAnnouncements.length > 0) {
//             console.log(`Publishing ${pendingAnnouncements.length} scheduled announcements`);
            
//             for (const announcement of pendingAnnouncements) {
//                 console.log(`Publishing announcement #${announcement.id} scheduled for ${announcement.scheduled_at}`);
//                 await dbPromise.query(
//                     'UPDATE announcements SET is_posted = 1 WHERE id = ?',
//                     [announcement.id]
//                 );
//                 console.log(`Published announcement #${announcement.id}`);
//             }
//         }
//     } catch (error) {
//         console.error("Error publishing scheduled announcements:", error);
//     }
// };

// // Function to automatically delete inactive announcements after 7 days
// const cleanupInactiveAnnouncements = async () => {
//     try {
//         // Get current date in Singapore timezone
//         const now = new Date();
//         // Convert to Singapore timezone (GMT+8)
//         now.setHours(now.getHours() + 8);
        
//         const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
//         console.log(`Running cleanup for inactive announcements: ${formattedDate}`);
        
//         // Find announcements that are inactive for 7+ days
//         // Use COALESCE to handle NULL updated_at values (fall back to created_at)
//         const query = `
//             UPDATE announcements 
//             SET is_delete = 1 
//             WHERE is_active = 0 
//             AND is_delete = 0
//             AND COALESCE(updated_at, created_at) < DATE_SUB(?, INTERVAL 7 DAY)
//         `;
        
//         const [result] = await dbPromise.query(query, [formattedDate]);
        
//         if (result.affectedRows > 0) {
//             console.log(`Marked ${result.affectedRows} inactive announcements as deleted after 7 days`);
//         } else {
//             console.log('No inactive announcements to clean up');
//         }
//     } catch (error) {
//         console.error('Error cleaning up inactive announcements:', error);
//     }
// };

// /**
//  * Automatically expire announcements that have been read by all targeted employees
//  * When an announcement has is_expired=1, it will be marked as deleted 7 days after
//  * the last employee reads it (meaning all targeted employees have read it)
//  */
// const expireReadAnnouncements = async () => {
//     try {
//         // Get current date in Singapore timezone
//         const now = new Date();
//         // Convert to Singapore timezone (GMT+8)
//         now.setHours(now.getHours() + 8);
        
//         const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
//         console.log(`Running expiration check for fully-read announcements: ${formattedDate}`);
        
//         // First, get all announcements marked for auto-expiration that aren't already deleted
//         const [announcements] = await dbPromise.query(`
//             SELECT id, title, is_acknowledgement, target_all
//             FROM announcements 
//             WHERE is_expired = 1 
//             AND is_delete = 0
//         `);
        
//         if (announcements.length === 0) {
//             console.log('No announcements marked for auto-expiration');
//             return;
//         }
        
//         console.log(`Found ${announcements.length} announcements marked for auto-expiration`);
        
//         // Process each announcement
//         for (const announcement of announcements) {
//             // Skip announcements that don't require acknowledgement
//             if (announcement.is_acknowledgement !== 1) {
//                 console.log(`Announcement #${announcement.id} doesn't require acknowledgement, skipping`);
//                 continue;
//             }
            
//             // Determine target employees for this announcement
//             let targetEmployeeIds = [];
            
//             if (announcement.target_all === 1) {
//                 // If targeting all employees, get all active employee IDs
//                 const [allEmployees] = await dbPromise.query(`
//                     SELECT id FROM employees WHERE status = 'active'
//                 `);
//                 targetEmployeeIds = allEmployees.map(emp => emp.id);
//             } else {
//                 // If targeting specific entities, get all targeted employee IDs
                
//                 // First check announcement_employees table
//                 const [directEmployees] = await dbPromise.query(`
//                     SELECT employee_id FROM announcement_employees WHERE announcement_id = ?
//                 `, [announcement.id]);
                
//                 if (directEmployees.length > 0) {
//                     targetEmployeeIds = directEmployees.map(emp => emp.employee_id);
//                 } else {
//                     // Check position-based targeting
//                     const [positionEmployees] = await dbPromise.query(`
//                         SELECT e.id 
//                         FROM employees e
//                         JOIN announcement_positions ap ON e.position_id = ap.position_id
//                         WHERE ap.announcement_id = ? AND e.status = 'active'
//                     `, [announcement.id]);
                    
//                     if (positionEmployees.length > 0) {
//                         targetEmployeeIds = positionEmployees.map(emp => emp.id);
//                     } else {
//                         // Check department-based targeting
//                         const [departmentEmployees] = await dbPromise.query(`
//                             SELECT e.id 
//                             FROM employees e
//                             JOIN announcement_departments ad ON e.department_id = ad.department_id
//                             WHERE ad.announcement_id = ? AND e.status = 'active'
//                         `, [announcement.id]);
                        
//                         if (departmentEmployees.length > 0) {
//                             targetEmployeeIds = departmentEmployees.map(emp => emp.id);
//                         } else {
//                             // Check company-based targeting
//                             const [companyEmployees] = await dbPromise.query(`
//                                 SELECT e.id 
//                                 FROM employees e
//                                 JOIN announcement_companies ac ON e.company_id = ac.company_id
//                                 WHERE ac.announcement_id = ? AND e.status = 'active'
//                             `, [announcement.id]);
                            
//                             if (companyEmployees.length > 0) {
//                                 targetEmployeeIds = companyEmployees.map(emp => emp.id);
//                             }
//                         }
//                     }
//                 }
//             }
            
//             // Skip if no target employees found
//             if (targetEmployeeIds.length === 0) {
//                 console.log(`No target employees found for announcement #${announcement.id}, skipping`);
//                 continue;
//             }
            
//             console.log(`Announcement #${announcement.id} targets ${targetEmployeeIds.length} employees`);
            
//             // Check how many employees have read this announcement
//             const [readCounts] = await dbPromise.query(`
//                 SELECT COUNT(*) as total_reads
//                 FROM announcement_reads
//                 WHERE announcement_id = ? AND employee_id IN (?) AND is_read = 1
//             `, [announcement.id, targetEmployeeIds]);
            
//             const totalReads = readCounts[0].total_reads;
            
//             // If all targeted employees have read the announcement
//             if (totalReads >= targetEmployeeIds.length) {
//                 console.log(`All ${targetEmployeeIds.length} employees have read announcement #${announcement.id}`);
                
//                 // Find when the last employee read this announcement (when it became fully read)
//                 const [lastReadDate] = await dbPromise.query(`
//                     SELECT MAX(read_at) as last_read_date
//                     FROM announcement_reads
//                     WHERE announcement_id = ? AND employee_id IN (?) AND is_read = 1
//                 `, [announcement.id, targetEmployeeIds]);
                
//                 if (!lastReadDate[0].last_read_date) {
//                     console.log(`Could not determine last read date for announcement #${announcement.id}, skipping`);
//                     continue;
//                 }
                
//                 const lastReadTimestamp = new Date(lastReadDate[0].last_read_date);
                
//                 // Calculate if 7 days have passed since the last read
//                 const sevenDaysAfterLastRead = new Date(lastReadTimestamp);
//                 sevenDaysAfterLastRead.setDate(sevenDaysAfterLastRead.getDate() + 7);
                
//                 if (now >= sevenDaysAfterLastRead) {
//                     console.log(`Marking announcement #${announcement.id} as deleted - all employees read it on ${lastReadTimestamp.toISOString()}, which was more than 7 days ago`);
                    
//                     // Mark the announcement as deleted
//                     await dbPromise.query(`
//                         UPDATE announcements
//                         SET is_delete = 1, updated_at = NOW()
//                         WHERE id = ?
//                     `, [announcement.id]);
//                 } else {
//                     console.log(`Announcement #${announcement.id} will be eligible for deletion on ${sevenDaysAfterLastRead.toISOString()}`);
//                 }
//             } else {
//                 console.log(`Only ${totalReads} of ${targetEmployeeIds.length} employees have read announcement #${announcement.id}`);
//             }
//         }
//     } catch (error) {
//         console.error('Error processing announcement expiration:', error);
//     }
// };

// // Upload documents for announcements
// const uploadAnnouncementDocuments = async (req, res) => {
//     try {
//         const { announcement_id } = req.params;
        
//         // Validate announcement exists
//         const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
//         if (announcementCheck.length === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }
        
//         // Check if files exist in request
//         if (!req.files) {
//             return res.status(400).json({ error: "No files uploaded" });
//         }
        
//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();
        
//         try {
//             // Handle multiple file attachments if present
//             let attachments = [];
            
//             // Support different ways files might be submitted
//             if (req.files['attachments[]']) {
//                 attachments = Array.isArray(req.files['attachments[]'])
//                     ? req.files['attachments[]']
//                     : [req.files['attachments[]']];
//             } else if (req.files.attachments) {
//                 attachments = Array.isArray(req.files.attachments)
//                     ? req.files.attachments
//                     : [req.files.attachments];
//             } else if (req.files.attachment) {
//                 attachments = [req.files.attachment];
//             } else {
//                 // Get first file if no specific field is used
//                 attachments = [Object.values(req.files)[0]];
//             }
            
//             // Configure AWS S3
//             const s3 = new AWS.S3({
//                 accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                 secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                 region: process.env.AWS_REGION,
//                 signatureVersion: 'v4',
//                 endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
//             });
            
//             const uploadedDocuments = [];
            
//             for (const file of attachments) {
//                 // Prepare file data for S3
//                 const fileData = {
//                     Bucket: process.env.AWS_BUCKET_NAME,
//                     Key: `announcements/${announcement_id}/${file.name}`,
//                     Body: file.data,
//                     ContentType: file.mimetype,
//                     Size: file.size
//                 };
                
//                 // Upload to S3
//                 const uploadedData = await s3.upload(fileData).promise();
                
//                 // Save document reference in database
//                 const insertQuery = `
//                     INSERT INTO announcement_documents (
//                         announcement_id, 
//                         document_type, 
//                         s3_key, 
//                         original_filename, 
//                         file_size, 
//                         content_type
//                     ) VALUES (?, ?, ?, ?, ?, ?)
//                 `;
                
//                 const [result] = await connection.query(insertQuery, [
//                     announcement_id,
//                     file.mimetype,
//                     fileData.Key,
//                     file.name,
//                     file.size,
//                     file.mimetype
//                 ]);
                
//                 uploadedDocuments.push({
//                     id: result.insertId,
//                     filename: file.name,
//                     url: uploadedData.Location
//                 });
//             }
            
//             // Commit transaction
//             await connection.commit();
            
//             res.status(201).json({
//                 message: "Documents uploaded successfully",
//                 documents: uploadedDocuments
//             });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error("Error uploading announcement documents:", error);
//         res.status(500).json({ error: "Failed to upload documents" });
//     }
// };

// // Get documents for an announcement
// const getAnnouncementDocuments = async (req, res) => {
//     try {
//         const { announcement_id } = req.params;
        
//         // Validate announcement exists
//         const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
//         if (announcementCheck.length === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }
        
//         // Get documents
//         const query = `
//             SELECT 
//                 id,
//                 document_type,
//                 s3_key,
//                 original_filename,
//                 file_size,
//                 content_type,
//                 uploaded_at
//             FROM 
//                 announcement_documents
//             WHERE 
//                 announcement_id = ?
//             ORDER BY 
//                 uploaded_at DESC
//         `;
        
//         const [documents] = await dbPromise.query(query, [announcement_id]);
        
//         // Generate presigned URLs for each document (valid for 1 hour)
//         const s3 = new AWS.S3({
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             region: process.env.AWS_REGION,
//             signatureVersion: 'v4'
//         });
        
//         const documentsWithUrls = await Promise.all(documents.map(async (doc) => {
//             const params = {
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: doc.s3_key,
//                 Expires: 3600 // URL valid for 1 hour
//             };
            
//             try {
//                 const url = await s3.getSignedUrlPromise('getObject', params);
//                 return {
//                     ...doc,
//                     download_url: url
//                 };
//             } catch (error) {
//                 console.error(`Error generating presigned URL for ${doc.s3_key}:`, error);
//                 return {
//                     ...doc,
//                     download_url: null
//                 };
//             }
//         }));
        
//         res.json({
//             announcement_id,
//             document_count: documents.length,
//             documents: documentsWithUrls,
//             viewUrl: documentsWithUrls
//         });
//     } catch (error) {
//         console.error("Error fetching announcement documents:", error);
//         res.status(500).json({ error: "Failed to fetch documents" });
//     }
// };

// // Delete a document from an announcement
// const deleteAnnouncementDocument = async (req, res) => {
//     try {
//         const { announcement_id, document_id } = req.body;
        
//         if(!announcement_id || !document_id){
//             return res.status(400).json({ error: "Announcement ID and document ID are required" });
//         }

//         // Validate announcement exists
//         const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
//         if (announcementCheck.length === 0) {
//             return res.status(404).json({ error: "Announcement not found" });
//         }
        
//         // Get document info before deleting to remove from S3
//         const [documentCheck] = await dbPromise.query(
//             'SELECT * FROM announcement_documents WHERE id = ? AND announcement_id = ?', 
//             [document_id, announcement_id]
//         );
        
//         if (documentCheck.length === 0) {
//             return res.status(404).json({ error: "Document not found" });
//         }
        
//         // Start transaction
//         const connection = await dbPromise.getConnection();
//         await connection.beginTransaction();
        
//         try {
//             // Delete document from database
//             const [result] = await connection.query(
//                 'DELETE FROM announcement_documents WHERE id = ? AND announcement_id = ?',
//                 [document_id, announcement_id]
//             );
            
//             if (result.affectedRows === 0) {
//                 await connection.rollback();
//                 return res.status(404).json({ error: "Document not found" });
//             }
            
//             // Delete from S3
//             const s3 = new AWS.S3({
//                 accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//                 secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//                 region: process.env.AWS_REGION,
//                 signatureVersion: 'v4'
//             });
            
//             await s3.deleteObject({
//                 Bucket: process.env.AWS_BUCKET_NAME,
//                 Key: documentCheck[0].s3_key
//             }).promise();
            
//             await connection.commit();
            
//             res.json({ 
//                 message: "Document deleted successfully",
//                 document_id: document_id
//             });
//         } catch (error) {
//             await connection.rollback();
//             throw error;
//         } finally {
//             connection.release();
//         }
//     } catch (error) {
//         console.error("Error deleting announcement document:", error);
//         res.status(500).json({ error: "Failed to delete document" });
//     }
// };

// // Get a pre-signed URL for document uploads with EmployeeDocumentManager
// const getAnnouncementDocumentUploadUrl = async (req, res) => {
//     try {
//         const { documentType, filename, contentType } = req.body;
//         const announcement_id = req.body.announcement_id || 'temp'; // Use temp if no ID yet
        
//         if (!filename || !contentType) {
//             return res.status(400).json({ error: "Filename and contentType are required" });
//         }
        
//         // Generate a unique S3 key for the file
//         const timestamp = new Date().getTime();
//         const s3Key = `announcements/${announcement_id}/${timestamp}_${filename}`;
        
//         // Configure AWS S3
//         const s3 = new AWS.S3({
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             region: process.env.AWS_REGION,
//             signatureVersion: 'v4'
//         });
        
//         // Generate a pre-signed URL for direct uploads
//         const uploadUrl = s3.getSignedUrl('putObject', {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: s3Key,
//             ContentType: contentType,
//             Expires: 60 * 15 // 15 minutes
//         });
        
//         res.json({
//             success: true,
//             uploadUrl,
//             s3Key,
//             contentType
//         });
//     } catch (error) {
//         console.error('Error generating upload URL:', error);
//         res.status(500).json({ error: "Failed to generate upload URL" });
//     }
// };

// // Create a new document record after S3 upload with EmployeeDocumentManager
// const createAnnouncementDocument = async (req, res) => {
//     try {
//         const { s3Key, documentType, originalFilename, fileSize, contentType } = req.body;
//         const announcement_id = req.body.announcement_id || req.query.announcement_id;
        
//         if (!s3Key || !originalFilename) {
//             return res.status(400).json({ error: "s3Key and originalFilename are required" });
//         }
        
//         // If no announcement_id, save metadata for later association
//         if (!announcement_id || announcement_id === 'temp') {
//             // For files uploaded before announcement creation, return a success
//             // These files will be associated with the announcement when it's created
//             return res.json({
//                 success: true,
//                 id: 0,
//                 message: "Document uploaded and pending association with announcement",
//                 s3Key,
//                 url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
//             });
//         }
        
//         // Save document reference in database
//         const insertQuery = `
//             INSERT INTO announcement_documents (
//                 announcement_id, 
//                 document_type, 
//                 s3_key, 
//                 original_filename, 
//                 file_size, 
//                 content_type
//             ) VALUES (?, ?, ?, ?, ?, ?)
//         `;
        
//         const [result] = await dbPromise.query(insertQuery, [
//             announcement_id,
//             documentType || contentType,
//             s3Key,
//             originalFilename,
//             fileSize || 0,
//             contentType || 'application/octet-stream'
//         ]);
        
//         res.json({
//             success: true,
//             id: result.insertId,
//             message: "Document uploaded successfully",
//             s3Key, 
//             url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
//         });
//     } catch (error) {
//         console.error('Error creating document record:', error);
//         res.status(500).json({ error: "Failed to save document metadata" });
//     }
// };

// // Get a document view URL with EmployeeDocumentManager
// const getAnnouncementDocumentViewUrl = async (req, res) => {
//     try {
//         const { document_id } = req.query;
        
//         if (!document_id) {
//             return res.status(400).json({ error: "Document ID is required" });
//         }
        
//         // Get document metadata from database
//         const [documents] = await dbPromise.query(
//             'SELECT * FROM announcement_documents WHERE id = ?',
//             [document_id]
//         );
        
//         if (documents.length === 0) {
//             return res.status(404).json({ error: "Document not found" });
//         }
        
//         const document = documents[0];
        
//         // Configure AWS S3
//         const s3 = new AWS.S3({
//             accessKeyId: process.env.AWS_ACCESS_KEY_ID,
//             secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
//             region: process.env.AWS_REGION,
//             signatureVersion: 'v4'
//         });
        
//         // Generate a pre-signed URL for viewing
//         const viewUrl = s3.getSignedUrl('getObject', {
//             Bucket: process.env.AWS_BUCKET_NAME,
//             Key: document.s3_key,
//             Expires: 60 * 60 // 1 hour
//         });
        
//         res.json({
//             success: true,
//             viewUrl,
//             document: {
//                 id: document.id,
//                 filename: document.original_filename,
//                 contentType: document.content_type
//             }
//         });
//     } catch (error) {
//         console.error('Error generating document view URL:', error);
//         res.status(500).json({ error: "Failed to generate document URL" });
//     }
// };

// module.exports = {
//     createAnnouncement,
//     getAllAnnouncements,
//     getAnnouncementById,
//     updateAnnouncement,
//     patchAnnouncement,
//     deleteAnnouncement,
//     updateAnnouncementRead,
//     publishScheduledAnnouncements,
//     cleanupInactiveAnnouncements,
//     expireReadAnnouncements,
//     uploadAnnouncementDocuments,
//     getAnnouncementDocuments,
//     deleteAnnouncementDocument,
//     getAnnouncementDocumentUploadUrl,
//     createAnnouncementDocument,
//     getAnnouncementDocumentViewUrl
// };

//NEW

const { dbPromise } = require('../models/db');
const jwt = require('jsonwebtoken');
const AWS = require('aws-sdk');


// Announcements
const createAnnouncement = async (req, res) => {
    try {
        // Check if data comes as JSON string in FormData or direct JSON
        let announcementData;
        if (req.body.data) {
            // Parse data from FormData
            announcementData = JSON.parse(req.body.data);
        } else {
            // Use raw JSON body
            announcementData = req.body;
        }
        
        const { 
            title, 
            content, 
            targets, 
            target_all = false, 
            is_posted = false, 
            is_acknowledgement = false, 
            is_force_login = false, 
            scheduled_at = null,
            is_expired = false
        } = announcementData;
        
        // Validate required fields
        if (!title || !content) {
            return res.status(400).json({ error: "Title and content are required fields" });
        }

        // Start a transaction since we need to add records to multiple tables
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // Insert the announcement
            const insertQuery = `
                INSERT INTO announcements (title, content, target_all, is_posted, is_active, is_acknowledgement, is_force_login, is_expired, scheduled_at, created_at)
                VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, NOW())
            `;

            // If no specific targets and target_all is not explicitly set to true,
            // default to targeting everyone
            const isTargetAll = target_all || (!targets || targets.length === 0);
            
            // If scheduled_at is provided, set is_posted to 0, it will be posted automatically when scheduled
            const willBePosted = scheduled_at ? 0 : is_posted ? 1 : 0;
            
            const [result] = await connection.query(insertQuery, [
                title, 
                content, 
                isTargetAll ? 1 : 0, 
                willBePosted, 
                is_acknowledgement ? 1 : 0, 
                is_force_login ? 1 : 0,
                is_expired ? 1 : 0,
                scheduled_at,
            ]);
            
            const announcementId = result.insertId;
            
            console.log("targets", targets);
            // If specific targets are provided, add them to the appropriate tables
            if (targets && targets.length > 0 && !isTargetAll) {
                const companyTargets = targets.filter(t => t.target_type === 'company').map(t => t.target_id);
                const departmentTargets = targets.filter(t => t.target_type === 'department').map(t => t.target_id);
                const positionTargets = targets.filter(t => t.target_type === 'position').map(t => t.target_id);
                const employeeTargets = targets.filter(t => t.target_type === 'employee').map(t => t.target_id);

                // Add employee targets
                if (employeeTargets.length > 0) {
                    for (const employeeId of employeeTargets) {
                        await connection.query(
                            'INSERT INTO announcement_employees (announcement_id, employee_id) VALUES (?, ?)',
                            [announcementId, employeeId]
                        );
                    }
                }
                // Add position targets
                else if (positionTargets.length > 0) {
                    for (const positionId of positionTargets) {
                        await connection.query(
                            'INSERT INTO announcement_positions (announcement_id, position_id) VALUES (?, ?)',
                            [announcementId, positionId]
                        );
                    }
                }
                else if (departmentTargets.length > 0) {
                    for (const departmentId of departmentTargets) {
                        await connection.query(
                            'INSERT INTO announcement_departments (announcement_id, department_id) VALUES (?, ?)',
                            [announcementId, departmentId]
                        );
                    }
                }
                else if (companyTargets.length > 0) {
                    for (const companyId of companyTargets) {
                        await connection.query(
                            'INSERT INTO announcement_companies (announcement_id, company_id) VALUES (?, ?)',
                            [announcementId, companyId]
                        );
                    }
                }
                
            }
            
            // Handle document uploads if files are included
            const uploadedDocuments = [];
            
            if (req.files) {
                // Configure AWS S3
                const s3 = new AWS.S3({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION,
                    signatureVersion: 'v4',
                    endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                });
                
                // Support different ways files might be submitted
                let attachments = [];
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
                } else {
                    // Get first file if no specific field is used
                    attachments = [Object.values(req.files)[0]];
                }
                
                for (const file of attachments) {
                    // Prepare file data for S3
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `announcements/${announcementId}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    
                    try {
                        // Upload to S3
                        const uploadedData = await s3.upload(fileData).promise();
                        
                        // Save document reference in database
                        const insertDocQuery = `
                            INSERT INTO announcement_documents (
                                announcement_id, 
                                document_type, 
                                s3_key, 
                                original_filename, 
                                file_size, 
                                content_type
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `;
                        
                        const [docResult] = await connection.query(insertDocQuery, [
                            announcementId,
                            file.mimetype,
                            fileData.Key,
                            file.name,
                            file.size,
                            file.mimetype
                        ]);
                        
                        uploadedDocuments.push({
                            id: docResult.insertId,
                            filename: file.name,
                            url: uploadedData.Location
                        });
                    } catch (error) {
                        console.error(`Error uploading file ${file.name} to S3:`, error);
                        // Continue with other files even if one fails
                    }
                }
            }

            // Commit the transaction
            await connection.commit();

            res.status(201).json({
                message: "Announcement created successfully",
                announcement_id: announcementId,
                scheduled: scheduled_at ? true : false,
                documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
            });
        } catch (error) {
                // Rollback in case of error
                await connection.rollback();
                throw error;
            } finally {
                connection.release();
            }
    } catch (error) {
        console.error("Error creating announcement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const getAllAnnouncements = async (req, res) => {
    try {
        
        // Get employee ID from request if available (for read status)
        const empId = req.query.employee_id || null;

        // Check if employee exists if ID provided
        if (empId) {
            const [empCheck] = await dbPromise.query('SELECT id FROM employees WHERE id = ?', [empId]);
            if (empCheck.length === 0) {
                return res.status(404).json({ error: "Employee not found" });
            }
        }

        // Improved query with proper parameter binding and structure
        const query = `
            SELECT 
                a.id,
                a.title,
                a.content,
                a.created_at,
                a.target_all,
                a.is_active,
                a.is_posted,
                a.is_acknowledgement,
                a.is_force_login,
                a.scheduled_at,
                a.updated_at,
                ar.is_read,
                (SELECT e.name FROM announcement_employees ae JOIN employees e ON ae.employee_id = e.id WHERE ae.announcement_id = a.id LIMIT 1) AS target_employees,
                (SELECT p.title FROM announcement_positions ap JOIN positions p ON ap.position_id = p.id WHERE ap.announcement_id = a.id LIMIT 1) AS target_positions,
                (SELECT d.department_name FROM announcement_departments ad JOIN departments d ON ad.department_id = d.id WHERE ad.announcement_id = a.id LIMIT 1) AS target_departments,
                (SELECT c.name FROM announcement_companies ac JOIN companies c ON ac.company_id = c.id WHERE ac.announcement_id = a.id LIMIT 1) AS target_companies,
                COALESCE(ar.read_at, 'Unread') AS read_status
            FROM 
                announcements a
            /* Read status join - only relevant if employee ID is provided */
            LEFT JOIN
                announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
            /* Join announcement targeting tables */
            LEFT JOIN 
                announcement_companies ac ON ac.announcement_id = a.id
            LEFT JOIN 
                announcement_departments ad ON ad.announcement_id = a.id
            LEFT JOIN 
                announcement_positions ap ON ap.announcement_id = a.id
            LEFT JOIN 
                announcement_employees ae ON ae.announcement_id = a.id
            /* Join employee table if employee ID is provided */
            ${empId ? 'JOIN employees e ON e.id = ?' : ''}
            /* Filter based on targeting conditions only if employee ID is provided */
            ${empId ? 'WHERE a.is_posted = 1 AND a.is_active = 1 AND a.is_delete = 0 AND (a.target_all = 1 OR ac.company_id = e.company_id OR ad.department_id = e.department_id OR ap.position_id = e.position_id OR ae.employee_id = e.id)' : 'WHERE a.is_delete = 0'}
            GROUP BY a.id
            ORDER BY a.created_at DESC
        `;

        // Prepare parameters based on whether empId is provided
        const params = empId ? [empId, empId] : [null];

        const [announcements] = await dbPromise.query(query, params);

        res.json(announcements
            .map(announcement => ({
                ...announcement,
                target_type: announcement.target_employees ? 'employee' :
                            announcement.target_positions ? 'position' :
                            announcement.target_departments ? 'department' :
                            announcement.target_companies ? 'company' : 'all',
                target_name: announcement.target_employees ? announcement.target_employees :
                            announcement.target_positions ? announcement.target_positions :
                            announcement.target_departments ? announcement.target_departments :
                            announcement.target_companies ? announcement.target_companies : 'all'
            }))
        );
    } catch (error) {
        console.error("Error fetching announcements:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const getAnnouncementById = async (req, res) => {
    try {
        const { id } = req.params;
        const empId = req.query.employee_id || null;

        // Basic announcement query without targeting restrictions
        let query = `
            SELECT 
                a.id,
                a.title,
                a.content,
                a.created_at,
                a.target_all,
                a.is_active,
                a.is_posted,
                a.scheduled_at
            FROM 
                announcements a
            WHERE a.id = ?
        `;

        // If employee ID is provided, also get read status
        if (empId) {
            query = `
                SELECT 
                    a.id,
                    a.title,
                    a.content,
                    a.created_at,
                    a.target_all,
                    a.is_active,
                    COALESCE(ar.read_at, 'Unread') AS read_status
                FROM 
                    announcements a
                LEFT JOIN 
                    announcement_reads ar ON ar.announcement_id = a.id AND ar.employee_id = ?
                WHERE a.id = ?
            `;
        }

        const [announcements] = await dbPromise.query(
            query,
            empId ? [empId, id] : [id]
        );

        if (announcements.length === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        // Get targeting information - which companies, departments, positions and employees
        const [targetCompanies] = await dbPromise.query(
            `SELECT c.id, c.name FROM announcement_companies ac 
             JOIN companies c ON ac.company_id = c.id 
             WHERE ac.announcement_id = ?`,
            [id]
        );

        const [targetDepartments] = await dbPromise.query(
            `SELECT d.id, d.department_name, d.company_id, c.name AS company_name FROM announcement_departments ad 
             JOIN departments d ON ad.department_id = d.id 
             JOIN companies c ON d.company_id = c.id
             WHERE ad.announcement_id = ?`,
            [id]
        );

        const [targetPositions] = await dbPromise.query(
            `SELECT p.id, p.title, d.department_name, c.name AS company_name FROM announcement_positions ap
            JOIN positions p ON ap.position_id = p.id
            JOIN departments d ON p.department_id = d.id
            JOIN companies c ON d.company_id = c.id
            WHERE ap.announcement_id = ?`,
            [id]
        );

        const [targetEmployees] = await dbPromise.query(
            `SELECT e.id, e.name, p.title AS position_title, p.job_level, d.department_name, c.name AS company_name FROM announcement_employees ae 
             JOIN employees e ON ae.employee_id = e.id
             JOIN positions p ON e.position_id = p.id
             JOIN departments d ON e.department_id = d.id
             JOIN companies c ON d.company_id = c.id
             WHERE ae.announcement_id = ?`,
            [id]
        );

        // Build a complete response
        const response = {
            ...announcements[0],
            is_posted: announcements[0].is_posted === 0 ? false : true,
            scheduled_at: announcements[0].scheduled_at,
            targets: {
                companies: targetCompanies.map(company => ({
                    id: company.id,
                    name: company.name
                })) ,
                departments: targetDepartments.map(department => ({
                    id: department.id,
                    name: department.department_name,
                    company_name: department.company_name
                })),
                positions: targetPositions.map(position => ({
                    id: position.id,
                    name: position.title,
                    department_name: position.department_name,
                    company_name: position.company_name
                })),
                employees: targetEmployees.map(employee => ({
                    id: employee.id,
                    name: employee.name,
                    position_title: employee.position_title,
                    job_level: employee.job_level,
                    department_name: employee.department_name,
                    company_name: employee.company_name
                }))
            }
        };

        res.json(response);
    } catch (error) {
        console.error("Error fetching announcement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const updateAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        
        // Check if data comes as JSON string in FormData or direct JSON
        let announcementData;
        if (req.body.data) {
            // Parse data from FormData
            announcementData = JSON.parse(req.body.data);
        } else {
            // Use raw JSON body
            announcementData = req.body;
        }
        
        const { 
            title, 
            content, 
            targets, 
            target_all = false, 
            is_posted = false, 
            scheduled_at = null 
        } = announcementData;

        // Validate required fields
        if (!title || !content) {
            return res.status(400).json({ error: "Title and content are required fields" });
        }

        // Start a transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();

        try {
            // If scheduled_at is provided, set is_posted to 0, it will be posted automatically when scheduled
            const willBePosted = scheduled_at ? 0 : is_posted ? 1 : 0;

            // First, check if the announcement exists
            const [checkResult] = await connection.query(
                'SELECT id FROM announcements WHERE id = ?',
                [id]
            );

            if (checkResult.length === 0) {
                await connection.rollback();
                return res.status(404).json({ error: "Announcement not found" });
            }

            // Update announcement basic info
            const isTargetAll = target_all || (!targets || targets.length === 0);

            await connection.query(
                'UPDATE announcements SET title = ?, content = ?, target_all = ?, is_posted = ?, scheduled_at = ? WHERE id = ?',
                [title, content, isTargetAll ? 1 : 0, willBePosted, scheduled_at, id]
            );

            // Clear all existing targets
            await connection.query('DELETE FROM announcement_companies WHERE announcement_id = ?', [id]);
            await connection.query('DELETE FROM announcement_departments WHERE announcement_id = ?', [id]);
            await connection.query('DELETE FROM announcement_positions WHERE announcement_id = ?', [id]);
            await connection.query('DELETE FROM announcement_employees WHERE announcement_id = ?', [id]);

            // If specific targets are provided, add them to the appropriate tables
            if (targets && targets.length > 0 && !isTargetAll) {
                const companyTargets = targets.filter(t => t.type === 'company').map(t => t.id);
                const departmentTargets = targets.filter(t => t.type === 'department').map(t => t.id);
                const positionTargets = targets.filter(t => t.type === 'position').map(t => t.id);
                const employeeTargets = targets.filter(t => t.type === 'employee').map(t => t.id);

                // Add company targets
                if (companyTargets.length > 0) {
                    for (const companyId of companyTargets) {
                        await connection.query(
                            'INSERT INTO announcement_companies (announcement_id, company_id) VALUES (?, ?)',
                            [id, companyId]
                        );
                    }
                }

                // Add department targets
                if (departmentTargets.length > 0) {
                    for (const departmentId of departmentTargets) {
                        await connection.query(
                            'INSERT INTO announcement_departments (announcement_id, department_id) VALUES (?, ?)',
                            [id, departmentId]
                        );
                    }
                }

                // Add position targets
                if (positionTargets.length > 0) {
                    for (const positionId of positionTargets) {
                        await connection.query(
                            'INSERT INTO announcement_positions (announcement_id, position_id) VALUES (?, ?)',
                            [id, positionId]
                        );
                    }
                }

                // Add employee targets
                if (employeeTargets.length > 0) {
                    for (const employeeId of employeeTargets) {
                        await connection.query(
                            'INSERT INTO announcement_employees (announcement_id, employee_id) VALUES (?, ?)',
                            [id, employeeId]
                        );
                    }
                }
            }
            
            // Handle document uploads if files are included
            const uploadedDocuments = [];
            if (req.files) {
                // Configure AWS S3
                const s3 = new AWS.S3({
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                    region: process.env.AWS_REGION,
                    signatureVersion: 'v4',
                    endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
                });
                
                // Support different ways files might be submitted
                let attachments = [];
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
                } else {
                    // Get first file if no specific field is used
                    attachments = [Object.values(req.files)[0]];
                }
                
                for (const file of attachments) {
                    // Prepare file data for S3
                    const fileData = {
                        Bucket: process.env.AWS_BUCKET_NAME,
                        Key: `announcements/${id}/${file.name}`,
                        Body: file.data,
                        ContentType: file.mimetype,
                        Size: file.size
                    };
                    
                    try {
                        // Upload to S3
                        const uploadedData = await s3.upload(fileData).promise();
                        
                        // Save document reference in database
                        const insertDocQuery = `
                            INSERT INTO announcement_documents (
                                announcement_id, 
                                document_type, 
                                s3_key, 
                                original_filename, 
                                file_size, 
                                content_type
                            ) VALUES (?, ?, ?, ?, ?, ?)
                        `;
                        
                        const [docResult] = await connection.query(insertDocQuery, [
                            id,
                            file.mimetype,
                            fileData.Key,
                            file.name,
                            file.size,
                            file.mimetype
                        ]);
                        
                        uploadedDocuments.push({
                            id: docResult.insertId,
                            filename: file.name,
                            url: uploadedData.Location
                        });
                    } catch (error) {
                        console.error(`Error uploading file ${file.name} to S3:`, error);
                        // Continue with other files even if one fails
                    }
                }
            }

            // Commit the transaction
            await connection.commit();

            res.json({ 
                message: "Announcement updated successfully",
                announcement_id: id,
                scheduled: scheduled_at ? true : false,
                documents: uploadedDocuments.length > 0 ? uploadedDocuments : null
             });
        } catch (error) {
            // Rollback in case of error
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error updating announcement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const patchAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;

        const query = `UPDATE announcements SET is_active = ? WHERE id = ?`;
        const [result] = await dbPromise.query(query, [is_active, id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({ message: "Announcement updated successfully" });
    }
    catch (error) {
        console.error("Error patching announcement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

const deleteAnnouncement = async (req, res) => {
    try {
        const { id } = req.params;

        // Delete announcement
        const query = `DELETE FROM announcements WHERE id = ?`;

        const [result] = await dbPromise.query(query, [id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({ message: "Announcement deleted successfully" });
    } catch (error) {
        console.error("Error deleting announcement:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

const updateAnnouncementRead = async (req, res) => {
    try {
        const { announcement_id, employee_id, is_read} = req.body;

        const checkQuery = `SELECT * FROM announcement_reads WHERE announcement_id = ? AND employee_id = ? AND is_read = 0`;
        const [existing] = await dbPromise.query(checkQuery, [announcement_id, employee_id]);

        let result;
        if(existing.length > 0){
            const query = `UPDATE announcement_reads SET is_read = ?, read_at = ? WHERE announcement_id = ? AND employee_id = ?`;
            [result] = await dbPromise.query(query, [is_read, is_read ? new Date() : null, announcement_id, employee_id]);
        }
        else{
            const query = `INSERT INTO announcement_reads (announcement_id, employee_id, is_read, read_at) VALUES (?, ?, ?, ?)`;    
            [result] = await dbPromise.query(query, [announcement_id, employee_id, is_read, is_read ? new Date() : null]);
        }

        if (result.affectedRows === 0) {
            console.log("Announcement not found");
            return res.status(404).json({ error: "Announcement not found" });
        }

        res.json({ message: "Announcement read successfully" });
    }
    catch (error) {
        console.error("Error patching announcement read:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};

// Add a new function to publish scheduled announcements
const publishScheduledAnnouncements = async () => {
    try {
        // Create date in GMT+8 timezone to match submission timezone
        const now = new Date();
        // Add 8 hours to match GMT+8
        now.setHours(now.getHours() + 8);
        const currentDate = now.toISOString().slice(0, 19).replace('T', ' ');
        
        console.log("Current Date (GMT+8): ", currentDate);
        
        const [pendingAnnouncements] = await dbPromise.query(
            `SELECT id, scheduled_at FROM announcements 
             WHERE scheduled_at IS NOT NULL 
             AND scheduled_at <= ? 
             AND is_posted = 0`,
            [currentDate]
        );
        
        if (pendingAnnouncements.length > 0) {
            console.log(`Publishing ${pendingAnnouncements.length} scheduled announcements`);
            
            for (const announcement of pendingAnnouncements) {
                console.log(`Publishing announcement #${announcement.id} scheduled for ${announcement.scheduled_at}`);
                await dbPromise.query(
                    'UPDATE announcements SET is_posted = 1 WHERE id = ?',
                    [announcement.id]
                );
                console.log(`Published announcement #${announcement.id}`);
            }
        }
    } catch (error) {
        console.error("Error publishing scheduled announcements:", error);
    }
};

// Function to automatically delete inactive announcements after 7 days
const cleanupInactiveAnnouncements = async () => {
    try {
        // Get current date in Singapore timezone
        const now = new Date();
        // Convert to Singapore timezone (GMT+8)
        now.setHours(now.getHours() + 8);
        
        const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
        console.log(`Running cleanup for inactive announcements: ${formattedDate}`);
        
        // Find announcements that are inactive for 7+ days
        // Use COALESCE to handle NULL updated_at values (fall back to created_at)
        const query = `
            UPDATE announcements 
            SET is_delete = 1 
            WHERE is_active = 0 
            AND is_delete = 0
            AND COALESCE(updated_at, created_at) < DATE_SUB(?, INTERVAL 7 DAY)
        `;
        
        const [result] = await dbPromise.query(query, [formattedDate]);
        
        if (result.affectedRows > 0) {
            console.log(`Marked ${result.affectedRows} inactive announcements as deleted after 7 days`);
        } else {
            console.log('No inactive announcements to clean up');
        }
    } catch (error) {
        console.error('Error cleaning up inactive announcements:', error);
    }
};

/**
 * Automatically expire announcements that have been read by all targeted employees
 * When an announcement has is_expired=1, it will be marked as deleted 7 days after
 * the last employee reads it (meaning all targeted employees have read it)
 */
const expireReadAnnouncements = async () => {
    try {
        // Get current date in Singapore timezone
        const now = new Date();
        // Convert to Singapore timezone (GMT+8)
        now.setHours(now.getHours() + 8);
        
        const formattedDate = now.toISOString().slice(0, 19).replace('T', ' ');
        console.log(`Running expiration check for fully-read announcements: ${formattedDate}`);
        
        // First, get all announcements marked for auto-expiration that aren't already deleted
        const [announcements] = await dbPromise.query(`
            SELECT id, title, is_acknowledgement, target_all
            FROM announcements 
            WHERE is_expired = 1 
            AND is_delete = 0
        `);
        
        if (announcements.length === 0) {
            console.log('No announcements marked for auto-expiration');
            return;
        }
        
        console.log(`Found ${announcements.length} announcements marked for auto-expiration`);
        
        // Process each announcement
        for (const announcement of announcements) {
            // Skip announcements that don't require acknowledgement
            if (announcement.is_acknowledgement !== 1) {
                console.log(`Announcement #${announcement.id} doesn't require acknowledgement, skipping`);
                continue;
            }
            
            // Determine target employees for this announcement
            let targetEmployeeIds = [];
            
            if (announcement.target_all === 1) {
                // If targeting all employees, get all active employee IDs
                const [allEmployees] = await dbPromise.query(`
                    SELECT id FROM employees WHERE status = 'active'
                `);
                targetEmployeeIds = allEmployees.map(emp => emp.id);
            } else {
                // If targeting specific entities, get all targeted employee IDs
                
                // First check announcement_employees table
                const [directEmployees] = await dbPromise.query(`
                    SELECT employee_id FROM announcement_employees WHERE announcement_id = ?
                `, [announcement.id]);
                
                if (directEmployees.length > 0) {
                    targetEmployeeIds = directEmployees.map(emp => emp.employee_id);
                } else {
                    // Check position-based targeting
                    const [positionEmployees] = await dbPromise.query(`
                        SELECT e.id 
                        FROM employees e
                        JOIN announcement_positions ap ON e.position_id = ap.position_id
                        WHERE ap.announcement_id = ? AND e.status = 'active'
                    `, [announcement.id]);
                    
                    if (positionEmployees.length > 0) {
                        targetEmployeeIds = positionEmployees.map(emp => emp.id);
                    } else {
                        // Check department-based targeting
                        const [departmentEmployees] = await dbPromise.query(`
                            SELECT e.id 
                            FROM employees e
                            JOIN announcement_departments ad ON e.department_id = ad.department_id
                            WHERE ad.announcement_id = ? AND e.status = 'active'
                        `, [announcement.id]);
                        
                        if (departmentEmployees.length > 0) {
                            targetEmployeeIds = departmentEmployees.map(emp => emp.id);
                        } else {
                            // Check company-based targeting
                            const [companyEmployees] = await dbPromise.query(`
                                SELECT e.id 
                                FROM employees e
                                JOIN announcement_companies ac ON e.company_id = ac.company_id
                                WHERE ac.announcement_id = ? AND e.status = 'active'
                            `, [announcement.id]);
                            
                            if (companyEmployees.length > 0) {
                                targetEmployeeIds = companyEmployees.map(emp => emp.id);
                            }
                        }
                    }
                }
            }
            
            // Skip if no target employees found
            if (targetEmployeeIds.length === 0) {
                console.log(`No target employees found for announcement #${announcement.id}, skipping`);
                continue;
            }
            
            console.log(`Announcement #${announcement.id} targets ${targetEmployeeIds.length} employees`);
            
            // Check how many employees have read this announcement
            const [readCounts] = await dbPromise.query(`
                SELECT COUNT(*) as total_reads
                FROM announcement_reads
                WHERE announcement_id = ? AND employee_id IN (?) AND is_read = 1
            `, [announcement.id, targetEmployeeIds]);
            
            const totalReads = readCounts[0].total_reads;
            
            // If all targeted employees have read the announcement
            if (totalReads >= targetEmployeeIds.length) {
                console.log(`All ${targetEmployeeIds.length} employees have read announcement #${announcement.id}`);
                
                // Find when the last employee read this announcement (when it became fully read)
                const [lastReadDate] = await dbPromise.query(`
                    SELECT MAX(read_at) as last_read_date
                    FROM announcement_reads
                    WHERE announcement_id = ? AND employee_id IN (?) AND is_read = 1
                `, [announcement.id, targetEmployeeIds]);
                
                if (!lastReadDate[0].last_read_date) {
                    console.log(`Could not determine last read date for announcement #${announcement.id}, skipping`);
                    continue;
                }
                
                const lastReadTimestamp = new Date(lastReadDate[0].last_read_date);
                
                // Calculate if 7 days have passed since the last read
                const sevenDaysAfterLastRead = new Date(lastReadTimestamp);
                sevenDaysAfterLastRead.setDate(sevenDaysAfterLastRead.getDate() + 7);
                
                if (now >= sevenDaysAfterLastRead) {
                    console.log(`Marking announcement #${announcement.id} as deleted - all employees read it on ${lastReadTimestamp.toISOString()}, which was more than 7 days ago`);
                    
                    // Mark the announcement as deleted
                    await dbPromise.query(`
                        UPDATE announcements
                        SET is_delete = 1, updated_at = NOW()
                        WHERE id = ?
                    `, [announcement.id]);
                } else {
                    console.log(`Announcement #${announcement.id} will be eligible for deletion on ${sevenDaysAfterLastRead.toISOString()}`);
                }
            } else {
                console.log(`Only ${totalReads} of ${targetEmployeeIds.length} employees have read announcement #${announcement.id}`);
            }
        }
    } catch (error) {
        console.error('Error processing announcement expiration:', error);
    }
};

// Upload documents for announcements
const uploadAnnouncementDocuments = async (req, res) => {
    try {
        const { announcement_id } = req.params;
        
        // Validate announcement exists
        const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
        if (announcementCheck.length === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }
        
        // Check if files exist in request
        if (!req.files) {
            return res.status(400).json({ error: "No files uploaded" });
        }
        
        // Start transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();
        
        try {
            // Handle multiple file attachments if present
            let attachments = [];
            
            // Support different ways files might be submitted
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
            } else {
                // Get first file if no specific field is used
                attachments = [Object.values(req.files)[0]];
            }
            
            // Configure AWS S3
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
                signatureVersion: 'v4',
                endpoint: `https://s3.${process.env.AWS_REGION}.amazonaws.com`
            });
            
            const uploadedDocuments = [];
            
            for (const file of attachments) {
                // Prepare file data for S3
                const fileData = {
                    Bucket: process.env.AWS_BUCKET_NAME,
                    Key: `announcements/${announcement_id}/${file.name}`,
                    Body: file.data,
                    ContentType: file.mimetype,
                    Size: file.size
                };
                
                // Upload to S3
                const uploadedData = await s3.upload(fileData).promise();
                
                // Save document reference in database
                const insertQuery = `
                    INSERT INTO announcement_documents (
                        announcement_id, 
                        document_type, 
                        s3_key, 
                        original_filename, 
                        file_size, 
                        content_type
                    ) VALUES (?, ?, ?, ?, ?, ?)
                `;
                
                const [result] = await connection.query(insertQuery, [
                    announcement_id,
                    file.mimetype,
                    fileData.Key,
                    file.name,
                    file.size,
                    file.mimetype
                ]);
                
                uploadedDocuments.push({
                    id: result.insertId,
                    filename: file.name,
                    url: uploadedData.Location
                });
            }
            
            // Commit transaction
            await connection.commit();
            
            res.status(201).json({
                message: "Documents uploaded successfully",
                documents: uploadedDocuments
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error uploading announcement documents:", error);
        res.status(500).json({ error: "Failed to upload documents" });
    }
};

// Get documents for an announcement
const getAnnouncementDocuments = async (req, res) => {
    try {
        const { announcement_id } = req.params;
        
        // Validate announcement exists
        const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
        if (announcementCheck.length === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }
        
        // Get documents
        const query = `
            SELECT 
                id,
                document_type,
                s3_key,
                original_filename,
                file_size,
                content_type,
                uploaded_at
            FROM 
                announcement_documents
            WHERE 
                announcement_id = ?
            ORDER BY 
                uploaded_at DESC
        `;
        
        const [documents] = await dbPromise.query(query, [announcement_id]);
        
        // Generate presigned URLs for each document (valid for 1 hour)
        const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            signatureVersion: 'v4'
        });
        
        const documentsWithUrls = await Promise.all(documents.map(async (doc) => {
            const params = {
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: doc.s3_key,
                Expires: 3600 // URL valid for 1 hour
            };
            
            try {
                const url = await s3.getSignedUrlPromise('getObject', params);
                return {
                    ...doc,
                    download_url: url
                };
            } catch (error) {
                console.error(`Error generating presigned URL for ${doc.s3_key}:`, error);
                return {
                    ...doc,
                    download_url: null
                };
            }
        }));
        
        res.json({
            announcement_id,
            document_count: documents.length,
            documents: documentsWithUrls,
            viewUrl: documentsWithUrls
        });
    } catch (error) {
        console.error("Error fetching announcement documents:", error);
        res.status(500).json({ error: "Failed to fetch documents" });
    }
};

// Delete a document from an announcement
const deleteAnnouncementDocument = async (req, res) => {
    try {
        const { announcement_id, document_id } = req.body;
        
        if(!announcement_id || !document_id){
            return res.status(400).json({ error: "Announcement ID and document ID are required" });
        }

        // Validate announcement exists
        const [announcementCheck] = await dbPromise.query('SELECT id FROM announcements WHERE id = ?', [announcement_id]);
        if (announcementCheck.length === 0) {
            return res.status(404).json({ error: "Announcement not found" });
        }
        
        // Get document info before deleting to remove from S3
        const [documentCheck] = await dbPromise.query(
            'SELECT * FROM announcement_documents WHERE id = ? AND announcement_id = ?', 
            [document_id, announcement_id]
        );
        
        if (documentCheck.length === 0) {
            return res.status(404).json({ error: "Document not found" });
        }
        
        // Start transaction
        const connection = await dbPromise.getConnection();
        await connection.beginTransaction();
        
        try {
            // Delete document from database
            const [result] = await connection.query(
                'DELETE FROM announcement_documents WHERE id = ? AND announcement_id = ?',
                [document_id, announcement_id]
            );
            
            if (result.affectedRows === 0) {
                await connection.rollback();
                return res.status(404).json({ error: "Document not found" });
            }
            
            // Delete from S3
            const s3 = new AWS.S3({
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                region: process.env.AWS_REGION,
                signatureVersion: 'v4'
            });
            
            await s3.deleteObject({
                Bucket: process.env.AWS_BUCKET_NAME,
                Key: documentCheck[0].s3_key
            }).promise();
            
            await connection.commit();
            
            res.json({ 
                message: "Document deleted successfully",
                document_id: document_id
            });
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error("Error deleting announcement document:", error);
        res.status(500).json({ error: "Failed to delete document" });
    }
};

// Get a pre-signed URL for document uploads with EmployeeDocumentManager
const getAnnouncementDocumentUploadUrl = async (req, res) => {
    try {
        const { documentType, filename, contentType } = req.body;
        const announcement_id = req.body.announcement_id || 'temp'; // Use temp if no ID yet
        
        if (!filename || !contentType) {
            return res.status(400).json({ error: "Filename and contentType are required" });
        }
        
        // Generate a unique S3 key for the file
        const timestamp = new Date().getTime();
        const s3Key = `announcements/${announcement_id}/${timestamp}_${filename}`;
        
        // Configure AWS S3
        const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            signatureVersion: 'v4'
        });
        
        // Generate a pre-signed URL for direct uploads
        const uploadUrl = s3.getSignedUrl('putObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: s3Key,
            ContentType: contentType,
            Expires: 60 * 15 // 15 minutes
        });
        
        res.json({
            success: true,
            uploadUrl,
            s3Key,
            contentType
        });
    } catch (error) {
        console.error('Error generating upload URL:', error);
        res.status(500).json({ error: "Failed to generate upload URL" });
    }
};

// Create a new document record after S3 upload with EmployeeDocumentManager
const createAnnouncementDocument = async (req, res) => {
    try {
        const { s3Key, documentType, originalFilename, fileSize, contentType } = req.body;
        const announcement_id = req.body.announcement_id || req.query.announcement_id;
        
        if (!s3Key || !originalFilename) {
            return res.status(400).json({ error: "s3Key and originalFilename are required" });
        }
        
        // If no announcement_id, save metadata for later association
        if (!announcement_id || announcement_id === 'temp') {
            // For files uploaded before announcement creation, return a success
            // These files will be associated with the announcement when it's created
            return res.json({
                success: true,
                id: 0,
                message: "Document uploaded and pending association with announcement",
                s3Key,
                url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
            });
        }
        
        // Save document reference in database
        const insertQuery = `
            INSERT INTO announcement_documents (
                announcement_id, 
                document_type, 
                s3_key, 
                original_filename, 
                file_size, 
                content_type
            ) VALUES (?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await dbPromise.query(insertQuery, [
            announcement_id,
            documentType || contentType,
            s3Key,
            originalFilename,
            fileSize || 0,
            contentType || 'application/octet-stream'
        ]);
        
        res.json({
            success: true,
            id: result.insertId,
            message: "Document uploaded successfully",
            s3Key, 
            url: `https://${process.env.AWS_BUCKET_NAME}.s3.amazonaws.com/${s3Key}`
        });
    } catch (error) {
        console.error('Error creating document record:', error);
        res.status(500).json({ error: "Failed to save document metadata" });
    }
};

// Get a document view URL with EmployeeDocumentManager
const getAnnouncementDocumentViewUrl = async (req, res) => {
    try {
        const { document_id } = req.query;
        
        if (!document_id) {
            return res.status(400).json({ error: "Document ID is required" });
        }
        
        // Get document metadata from database
        const [documents] = await dbPromise.query(
            'SELECT * FROM announcement_documents WHERE id = ?',
            [document_id]
        );
        
        if (documents.length === 0) {
            return res.status(404).json({ error: "Document not found" });
        }
        
        const document = documents[0];
        
        // Configure AWS S3
        const s3 = new AWS.S3({
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            region: process.env.AWS_REGION,
            signatureVersion: 'v4'
        });
        
        // Generate a pre-signed URL for viewing
        const viewUrl = s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_BUCKET_NAME,
            Key: document.s3_key,
            Expires: 60 * 60 // 1 hour
        });
        
        res.json({
            success: true,
            viewUrl,
            document: {
                id: document.id,
                filename: document.original_filename,
                contentType: document.content_type
            }
        });
    } catch (error) {
        console.error('Error generating document view URL:', error);
        res.status(500).json({ error: "Failed to generate document URL" });
    }
};

module.exports = {
    createAnnouncement,
    getAllAnnouncements,
    getAnnouncementById,
    updateAnnouncement,
    patchAnnouncement,
    deleteAnnouncement,
    updateAnnouncementRead,
    publishScheduledAnnouncements,
    cleanupInactiveAnnouncements,
    expireReadAnnouncements,
    uploadAnnouncementDocuments,
    getAnnouncementDocuments,
    deleteAnnouncementDocument,
    getAnnouncementDocumentUploadUrl,
    createAnnouncementDocument,
    getAnnouncementDocumentViewUrl
};