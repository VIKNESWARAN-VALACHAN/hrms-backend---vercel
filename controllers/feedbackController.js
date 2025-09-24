const { dbPromise } = require('../models/db');
const ExcelJS = require('exceljs');
const { sendEmail } = require('../utils/mailer');

// Submit new feedback
exports.submitFeedback = async (req, res) => {
  try {
    const { 
      staff_id, 
      section_id, 
      category_id, 
      feedback_type_id, 
      status_id = 1, // Default to 1 if not provided
      description, 
      attachments = null, 
      submit_anonymous = false 
    } = req.body;

    // Verify master table references exist
    const [sectionCheck] = await dbPromise.query(
      `SELECT 1 FROM master_sections WHERE id = ? LIMIT 1`, 
      [section_id]
    );
    if (!sectionCheck) {
      return res.status(400).json({ error: 'Invalid section' });
    }

    const [categoryCheck] = await dbPromise.query(
      `SELECT 1 FROM master_categories WHERE id = ? LIMIT 1`, 
      [category_id]
    );
    if (!categoryCheck) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    const [typeCheck] = await dbPromise.query(
      `SELECT 1 FROM master_feedback_types WHERE id = ? LIMIT 1`, 
      [feedback_type_id]
    );
    if (!typeCheck) {
      return res.status(400).json({ error: 'Invalid feedback type' });
    }

    const [statusCheck] = await dbPromise.query(
      `SELECT 1 FROM master_status WHERE id = ? LIMIT 1`, 
      [status_id]
    );
    if (!statusCheck) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Get PIC from configuration
    const [picRows] = await dbPromise.query(
      `SELECT * FROM feedback_pic_config WHERE section_id = ? AND status = 'Active' ORDER BY priority ASC LIMIT 1`, 
      [section_id]
    );
    
    const assigned_pic = picRows[0]?.email || null;
    const picName = picRows[0]?.name || null;

    // Insert feedback
    const [result] = await dbPromise.query(
      `INSERT INTO feedback_requests (
        staff_id, section_id, category_id, feedback_type_id, status_id, 
        description, attachments, assigned_pic, escalation_level, 
        submitted_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        staff_id,
        section_id,
        category_id,
        feedback_type_id,
        status_id,
        description,
        attachments,
        assigned_pic,
        1 // Default escalation level
      ]
    );

    const feedbackId = result.insertId;

    // Log the submission
    await dbPromise.query(
      `INSERT INTO feedback_logs (feedback_id, event, timestamp) VALUES (?, ?, NOW())`,
      [feedbackId, 'Feedback submitted by employee']
    );

    if (assigned_pic) {
      // Log assignment
      await dbPromise.query(
        `INSERT INTO feedback_logs (feedback_id, event, timestamp) VALUES (?, ?, NOW())`,
        [feedbackId, `Assigned to ${picName}`]
      );

      // Send email notification
      try {
        const [[category]] = await dbPromise.query(
          `SELECT name FROM master_categories WHERE id = ?`, 
          [category_id]
        );
        
        const [[priority]] = await dbPromise.query(
          `SELECT p.name 
           FROM feedback_priority_levels p
           JOIN feedback_pic_config fpc ON fpc.priority = p.id
           WHERE fpc.email = ? LIMIT 1`, 
          [assigned_pic]
        );

        await sendEmail({
          to: assigned_pic,
          subject: 'New Feedback Assigned',
          templateName: 'assignment',
          variables: {
            name: picName,
            ticket_id: feedbackId,
            category: category?.name || 'General',
            priority: priority?.name || 'Normal',
            description: description
          }
        });
      } catch (emailError) {
        console.error('Email sending failed:', emailError);
        // Continue even if email fails
      }
    }

    res.json({ 
      success: true,
      id: feedbackId, 
      assigned_to: assigned_pic,
      section_id,
      category_id,
      feedback_type_id
    });
  } catch (err) {
    console.error('Error submitting feedback:', err);
    res.status(500).json({ 
      error: 'Failed to submit feedback',
      details: err.message 
    });
  }
};

// Get feedbacks submitted by a staff
exports.getStaffFeedbacks = async (req, res) => {
  try {
    const staffId = req.params.staffId;
    const [rows] = await dbPromise.query(
      `SELECT fr.*, ms.name AS section_name, mc.name AS category_name, mft.name AS feedback_type_name, mst.name AS status_name FROM feedback_requests fr LEFT JOIN master_sections ms ON fr.section_id = ms.id LEFT JOIN master_categories mc ON fr.category_id = mc.id LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id LEFT JOIN master_status mst ON fr.status_id = mst.id WHERE fr.staff_id = ? ORDER BY fr.submitted_at DESC`,
      [staffId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching feedbacks:', err);
    res.status(500).json({ error: 'Failed to fetch feedbacks' });
  }
};

// Get single feedback details with replies (including attachments)
exports.getFeedbackDetails1 = async (req, res) => {
  try {
    const feedbackId = req.params.id;
    
    // 1. Fetch the main feedback record with all joined data
    const [feedbackRows] = await dbPromise.query(
      `SELECT 
        fr.id,
        fr.description,
        fr.submitted_at,
        fr.escalation_level,
        fr.staff_id,
        fr.assigned_pic,
        ms.name AS section,
        mc.name AS category,
        mft.name AS feedback_type,
        mst.name AS status,
        CONCAT(se.name) AS submitted_by
      FROM feedback_requests fr
      LEFT JOIN master_sections ms ON fr.section_id = ms.id
      LEFT JOIN master_categories mc ON fr.category_id = mc.id
      LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id
      LEFT JOIN master_status mst ON fr.status_id = mst.id
      LEFT JOIN employees se ON fr.staff_id = se.id
      WHERE fr.id = ?`,
      [feedbackId]
    );

    if (feedbackRows.length === 0) {
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const feedback = feedbackRows[0];

    // 2. Fetch replies (which include attachments in the same table)
    const [replyRows] = await dbPromise.query(
      `SELECT 
        fr.id,
        fr.response_message AS message,
        fr.responded_at AS timestamp,
        fr.responder_email,
        fr.attachments,
        CONCAT(e.name) AS sender
       FROM feedback_responses fr
       LEFT JOIN employees e ON fr.responder_email = e.email
       WHERE feedback_id = ?
       ORDER BY responded_at ASC`,
      [feedbackId]
    );

    // Process attachments from JSON string to array
    const processedReplies = replyRows.map(reply => {
      let attachments = [];
      try {
        attachments = reply.attachments ? JSON.parse(reply.attachments) : [];
      } catch (e) {
        console.error('Error parsing attachments:', e);
      }
      
      return {
        id: reply.id,
        sender: reply.sender || reply.responder_email,
        timestamp: reply.timestamp,
        message: reply.message,
        attachments: attachments.map(file => ({
          name: file,
          url: `${API_BASE_URL}/attachments/${file}` // Adjust this path as needed
        }))
      };
    });

    // Combine all data into a single response
    const response = {
      id: feedback.id,
      staff_id: feedback.staff_id,
      submitted_by: feedback.submitted_by,
      feedback_type: feedback.feedback_type,
      section: feedback.section,
      category: feedback.category,
      status: feedback.status,
      submitted_at: feedback.submitted_at,
      assigned_pic: feedback.assigned_pic,
      description: feedback.description,
      escalation_level: feedback.escalation_level,
      replies: processedReplies
    };

    res.json(response);
  } catch (err) {
    console.error('Error fetching feedback details:', err);
    res.status(500).json({ error: 'Failed to fetch feedback details' });
  }
};

// Get single feedback details with all related information
exports.getFeedbackDetails = async (req, res) => {
  const feedbackId = req.params.id;
  console.log('Fetching feedback details for ID:', feedbackId);

  try {
    if (!feedbackId || isNaN(feedbackId)) {
      console.log('Invalid feedback ID');
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }

    // 1. Get main feedback details
    const [feedbackRows] = await dbPromise.query(
      `SELECT 
        fr.*, 
        ms.name AS section_name, 
        mc.name AS category_name, 
        mft.name AS feedback_type_name, 
        mst.name AS status_name,
        CONCAT(e.name) AS submitted_by
      FROM feedback_requests fr
      LEFT JOIN master_sections ms ON fr.section_id = ms.id
      LEFT JOIN master_categories mc ON fr.category_id = mc.id
      LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id
      LEFT JOIN master_status mst ON fr.status_id = mst.id
      LEFT JOIN employees e ON fr.staff_id = e.id
      WHERE fr.id = ?`,
      [parseInt(feedbackId)]
    );

    console.log('Feedback query results:', feedbackRows);

    if (!feedbackRows || feedbackRows.length === 0) {
      console.log('No feedback found');
      return res.status(404).json({ error: 'Feedback not found' });
    }

    const feedback = feedbackRows[0];

    // 2. Get responses for this feedback
    const [responseRows] = await dbPromise.query(
      `SELECT 
        fr.id,
        fr.response_message AS message,
        fr.responded_at AS timestamp,
        fr.responder_email,
        fr.attachments,
        COALESCE(CONCAT(e.name), fr.responder_email) AS sender
      FROM feedback_responses fr
      LEFT JOIN employees e ON fr.responder_email = e.email
      WHERE fr.feedback_id = ?
      ORDER BY fr.responded_at ASC`,
      [parseInt(feedbackId)]
    );

    console.log('Response query results:', responseRows);

    // Process responses
    const replies = responseRows.map(response => {
      let attachments = [];
      try {
        attachments = response.attachments 
          ? (typeof response.attachments === 'string' 
              ? JSON.parse(response.attachments) 
              : response.attachments)
          : [];
      } catch (e) {
        console.error('Error parsing attachments:', e);
      }
      
      return {
        id: response.id,
        sender: response.sender,
        timestamp: response.timestamp,
        message: response.message,
        attachments: attachments.map(file => ({
          name: file,
          url: `${process.env.API_BASE_URL || 'http://localhost:5001'}/attachments/${file}`
        }))
      };
    });

    // Combine results
    const responseData = {
      ...feedback,
      replies: replies
    };

    return res.json(responseData);

  } catch (err) {
    console.error('Error:', err);
    return res.status(500).json({ 
      error: 'Server error',
      details: err.message 
    });
  }
};

exports.testFeedbackQuery = async (req, res) => {
  const feedbackId = req.params.id;
  console.log('Testing feedback query for ID:', feedbackId);

  try {
    if (!feedbackId || isNaN(feedbackId)) {
      console.log('Invalid feedback ID');
      return res.status(400).json({ error: 'Invalid feedback ID' });
    }

    // Execute just the feedback query
    const [feedbackRows] = await dbPromise.query(
      `SELECT 
        fr.*, 
        ms.name AS section_name, 
        mc.name AS category_name, 
        mft.name AS feedback_type_name, 
        mst.name AS status_name,
        CONCAT(e.name) AS submitted_by
      FROM feedback_requests fr
      LEFT JOIN master_sections ms ON fr.section_id = ms.id
      LEFT JOIN master_categories mc ON fr.category_id = mc.id
      LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id
      LEFT JOIN master_status mst ON fr.status_id = mst.id
      LEFT JOIN employees e ON fr.staff_id = e.id
      WHERE fr.id = ?`,
      [parseInt(feedbackId)]
    );

    console.log('Query results:', feedbackRows);

    if (!feedbackRows || feedbackRows.length === 0) {
      console.log('No results found');
      return res.json({ 
        status: 'empty', 
        message: 'No feedback found with this ID',
        query: `SELECT...WHERE id = ${feedbackId}`
      });
    }

    return res.json({
      status: 'success',
      data: feedbackRows[0],
      count: feedbackRows.length
    });

  } catch (err) {
    console.error('Query error:', err);
    return res.status(500).json({
      status: 'error',
      error: err.message,
      sqlMessage: err.sqlMessage
    });
  }
};

// Get single feedback by ID (staff)
exports.getSingleFeedback = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM feedback_requests WHERE id = ? AND staff_id = ?`, [req.params.id, req.params.staffId]);
    res.json(rows[0] || {});
  } catch (err) {
    console.error('Error fetching feedback:', err);
    res.status(500).json({ error: 'Failed to fetch feedback' });
  }
};

// Edit own feedback before response
exports.editOwnFeedback = async (req, res) => {
  try {
    const { description, attachments } = req.body;
    const sql = `UPDATE feedback_requests SET description = ?, attachments = ?, updated_at = NOW() WHERE id = ? AND staff_id = ? AND status_id = 1`;
    await dbPromise.query(sql, [description, attachments, req.params.id, req.params.staffId]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error editing feedback:', err);
    res.status(500).json({ error: 'Failed to edit feedback' });
  }
};


// Admin: get all feedbacks
exports.getAllFeedbacks = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT fr.*, ms.name AS section_name, mc.name AS category_name, mft.name AS feedback_type_name, mst.name AS status_name FROM feedback_requests fr LEFT JOIN master_sections ms ON fr.section_id = ms.id LEFT JOIN master_categories mc ON fr.category_id = mc.id LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id LEFT JOIN master_status mst ON fr.status_id = mst.id ORDER BY fr.submitted_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching all feedbacks:', err);
    res.status(500).json({ error: 'Failed to fetch all feedbacks' });
  }
};

// Admin: add response to feedback
exports.addResponse = async (req, res) => {
  try {
    const {
      response_message,
      responder_email,
      status_id = 3,
      attachments = null
    } = req.body;

    const feedbackId = req.params.id;

    const formattedAttachments = attachments
      ? JSON.stringify(Array.isArray(attachments) ? attachments : [attachments])
      : null;

    // Insert feedback response
    await dbPromise.query(
      `INSERT INTO feedback_responses 
       (feedback_id, responder_email, response_message, attachments, responded_at) 
       VALUES (?, ?, ?, ?, NOW())`,
      [feedbackId, responder_email, response_message, formattedAttachments]
    );

    // Get employee email
    const [[feedback]] = await dbPromise.query(
      `SELECT e.email 
       FROM feedback_requests fr
       JOIN employees e ON fr.staff_id = e.id
       WHERE fr.id = ?`,
      [feedbackId]
    );

    // Send email notification
    if (feedback?.email) {
      await sendEmail({
        to: feedback.email,
        subject: `Response to Your Feedback #${feedbackId}`,
        templateName: 'response_added',
        variables: {
          feedback_id: feedbackId,
          response_message,
          responder_email
        }
      });
    }

    // Update feedback status
    await dbPromise.query(
      `UPDATE feedback_requests 
       SET status_id = ?, updated_at = NOW() 
       WHERE id = ?`,
      [status_id, feedbackId]
    );

    // Log the response event
    await dbPromise.query(
      `INSERT INTO feedback_logs 
       (feedback_id, event, timestamp) 
       VALUES (?, ?, NOW())`,
      [feedbackId, `Response added by ${responder_email}`]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error adding response:', err);
    res.status(500).json({ error: 'Failed to respond to feedback' });
  }
};

exports.getResponses = async (req, res) => {
  const [rows] = await dbPromise.query(
    `SELECT responder_email AS sender, responded_at AS timestamp, response_message AS message
     FROM feedback_responses
     WHERE feedback_id = ?
     ORDER BY responded_at ASC`,
    [req.params.id]
  );

  res.json(rows);
};

// Admin: view feedback logs
exports.getFeedbackLogs = async (req, res) => {
  try {
    const [logs] = await dbPromise.query(`SELECT * FROM feedback_logs WHERE feedback_id = ? ORDER BY timestamp ASC`, [req.params.id]);
    res.json(logs);
  } catch (err) {
    console.error('Error fetching feedback logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};

// Admin: reroute feedback manually
exports.rerouteFeedback = async (req, res) => {
  try {
    const { new_pic_email, admin_note } = req.body;
    const sql = `UPDATE feedback_requests SET assigned_pic = ?, updated_at = NOW() WHERE id = ?`;
    await dbPromise.query(sql, [new_pic_email, req.params.id]);
    await dbPromise.query(`INSERT INTO feedback_logs (feedback_id, event, timestamp) VALUES (?, ?, NOW())`, [req.params.id, `Admin rerouted to ${new_pic_email} - ${admin_note}`]);
    
    // Get new PIC name
    const [[newPic]] = await dbPromise.query(
      `SELECT name FROM feedback_pic_config WHERE email = ?`, 
      [new_pic_email]
    );

    // Notify new PIC
    await sendEmail({
      to: new_pic_email,
      subject: `New Feedback Assignment #${req.params.id}`,
      templateName: 'reroute_notice',
      variables: {
        feedback_id: req.params.id,
        admin_note: admin_note,
        assigned_to: newPic?.name || 'you'
      }
    });
    
    res.json({ success: true });
  } catch (err) {
    console.error('Error rerouting feedback:', err);
    res.status(500).json({ error: 'Failed to reroute feedback' });
  }
};

// Admin: update feedback inline
exports.updateFeedbackInline = async (req, res) => {
  try {
    const { description, attachments } = req.body;
    const sql = `UPDATE feedback_requests SET description = ?, attachments = ?, updated_at = NOW() WHERE id = ?`;
    await dbPromise.query(sql, [description, attachments, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ error: 'Failed to update feedback' });
  }
};

// Admin: export feedbacks
exports.exportFeedbacks = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT fr.*, ms.name AS section_name, mc.name AS category_name, mft.name AS feedback_type_name, mst.name AS status_name FROM feedback_requests fr LEFT JOIN master_sections ms ON fr.section_id = ms.id LEFT JOIN master_categories mc ON fr.category_id = mc.id LEFT JOIN master_feedback_types mft ON fr.feedback_type_id = mft.id LEFT JOIN master_status mst ON fr.status_id = mst.id ORDER BY fr.submitted_at DESC`);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Feedbacks');
    sheet.columns = [
      { header: 'ID', key: 'id' },
      { header: 'Section', key: 'section_name' },
      { header: 'Category', key: 'category_name' },
      { header: 'Type', key: 'feedback_type_name' },
      { header: 'Status', key: 'status_name' },
      { header: 'Assigned PIC', key: 'assigned_pic' },
      { header: 'Escalation Level', key: 'escalation_level' },
      { header: 'Submitted', key: 'submitted_at' },
    ];
    sheet.addRows(rows);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=feedbacks.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Error exporting feedbacks:', err);
    res.status(500).json({ error: 'Failed to export feedbacks' });
  }
};

// Admin: change feedback status
exports.changeStatus = async (req, res) => {
  try {
    const { status_id } = req.body;

    // Update the feedback status
    await dbPromise.query(
      `UPDATE feedback_requests SET status_id = ?, updated_at = NOW() WHERE id = ?`,
      [status_id, req.params.id]
    );

    // Log the change
    await dbPromise.query(
      `INSERT INTO feedback_logs (feedback_id, event, timestamp) VALUES (?, ?, NOW())`,
      [req.params.id, `Status updated to ID ${status_id}`]
    );

    // Get status name
    const [[status]] = await dbPromise.query(
      `SELECT name FROM master_status WHERE id = ?`, 
      [status_id]
    );

    // Get feedback details with employee email
    const [feedback] = await dbPromise.query(
      `SELECT fr.staff_id, e.email, fr.assigned_pic 
       FROM feedback_requests fr
       LEFT JOIN employees e ON fr.staff_id = e.id
       WHERE fr.id = ?`, 
      [req.params.id]
    );

    // Notify submitter
    if (feedback[0]?.email) {
      await sendEmail({
        to: feedback[0].email,
        subject: `Feedback #${req.params.id} Status Updated`,
        templateName: 'status_update',
        variables: {
          name: feedback[0].email,
          ticket_id: req.params.id,
          status: status.name
        }
      });
    }

    // Notify PIC if different from submitter
    if (feedback[0]?.assigned_pic && feedback[0].assigned_pic !== feedback[0]?.email) {
      await sendEmail({
        to: feedback[0].assigned_pic,
        subject: `Feedback #${req.params.id} Status Updated`,
        templateName: 'status_update',
        variables: {
          name: 'PIC',
          ticket_id: req.params.id,
          status: status.name
        }
      });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error changing status:', err);
    res.status(500).json({ error: 'Failed to change feedback status' });
  }
};


// ===== PIC Configuration =====
exports.getPicConfigs = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM feedback_pic_config ORDER BY section_id, priority`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching PIC configs:', err);
    res.status(500).json({ error: 'Failed to fetch PIC configurations' });
  }
};

exports.addPicConfig = async (req, res) => {
  try {
    const { section_id, name, email, priority, status } = req.body;
    const sql = `INSERT INTO feedback_pic_config (section_id, name, email, priority, status) VALUES (?, ?, ?, ?, ?)`;
    const [result] = await dbPromise.query(sql, [section_id, name, email, priority, status]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error adding PIC config:', err);
    res.status(500).json({ error: 'Failed to add PIC configuration' });
  }
};

exports.updatePicConfig = async (req, res) => {
  try {
    const { section_id, name, email, priority, status } = req.body;
    const sql = `UPDATE feedback_pic_config SET section_id = ?, name = ?, email = ?, priority = ?, status = ? WHERE id = ?`;
    await dbPromise.query(sql, [section_id, name, email, priority, status, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating PIC config:', err);
    res.status(500).json({ error: 'Failed to update PIC configuration' });
  }
};

exports.deletePicConfig = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM feedback_pic_config WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting PIC config:', err);
    res.status(500).json({ error: 'Failed to delete PIC configuration' });
  }
};

// ===== Admin Settings =====
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM feedback_settings LIMIT 1`);
    res.json(rows[0] || {});
  } catch (err) {
    console.error('Error fetching settings:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { escalation_days, auto_escalation, allow_anonymous } = req.body;
    const sql = `UPDATE feedback_settings SET escalation_days = ?, auto_escalation = ?, allow_anonymous = ? WHERE id = 1`;
    await dbPromise.query(sql, [escalation_days, auto_escalation, allow_anonymous]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
};
/** */


// ===== Dashboard & Analytics =====
exports.getHeatmapStats = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT s.name AS section, c.name AS category, COUNT(*) AS count
      FROM feedback_requests f
      JOIN master_sections s ON f.section_id = s.id
      JOIN master_categories c ON f.category_id = c.id
      GROUP BY f.section_id, f.category_id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching heatmap stats:', err);
    res.status(500).json({ error: 'Failed to fetch heatmap statistics' });
  }
};

exports.getSlaMetrics = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT c.name AS category, 
             AVG(TIMESTAMPDIFF(HOUR, f.submitted_at, f.updated_at)) AS avg_response_time_hours
      FROM feedback_requests f
      JOIN master_categories c ON f.category_id = c.id
      WHERE f.status_id IN (SELECT id FROM master_status WHERE name = 'Resolved' OR name = 'Closed')
      GROUP BY f.category_id
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching SLA metrics:', err);
    res.status(500).json({ error: 'Failed to fetch SLA metrics' });
  }
};

exports.getKeywordTrends = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT keyword, COUNT(*) AS occurrences
      FROM (
        SELECT LOWER(TRIM(SUBSTRING_INDEX(SUBSTRING_INDEX(description, ' ', n.n), ' ', -1))) AS keyword
        FROM feedback_requests
        JOIN (
          SELECT a.N + b.N * 10 + 1 AS n
          FROM (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a,
               (SELECT 0 AS N UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
                UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
        ) n
        WHERE n.n <= 1 + (LENGTH(description) - LENGTH(REPLACE(description, ' ', '')))
      ) AS keywords
      WHERE keyword NOT IN ('the', 'and', 'to', 'of', 'a', 'in', 'for', 'is', 'on', 'that', '')
      GROUP BY keyword
      ORDER BY occurrences DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching keyword trends:', err);
    res.status(500).json({ error: 'Failed to fetch keyword trends' });
  }
};


exports.getMonthlyReport = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT 
        DATE_FORMAT(f.submitted_at, '%Y-%m') AS month,
        t.name AS feedback_type,
        s.name AS section,
        COUNT(*) AS total
      FROM feedback_requests f
      JOIN master_feedback_types t ON f.feedback_type_id = t.id
      JOIN master_sections s ON f.section_id = s.id
      GROUP BY month, f.feedback_type_id, f.section_id
      ORDER BY month DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching monthly report:', err);
    res.status(500).json({ error: 'Failed to fetch monthly report' });
  }
};


// ===== Master Data Management =====
exports.getSections = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM master_sections ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching sections:', err);
    res.status(500).json({ error: 'Failed to fetch sections' });
  }
};

exports.createSection = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `INSERT INTO master_sections (name) VALUES (?)`;
    const [result] = await dbPromise.query(sql, [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating section:', err);
    res.status(500).json({ error: 'Failed to create section' });
  }
};

exports.updateSection = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `UPDATE master_sections SET name = ? WHERE id = ?`;
    await dbPromise.query(sql, [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating section:', err);
    res.status(500).json({ error: 'Failed to update section' });
  }
};

exports.deleteSection = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM master_sections WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting section:', err);
    res.status(500).json({ error: 'Failed to delete section' });
  }
};

exports.getCategories = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM master_categories ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching categories:', err);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
};

exports.createCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `INSERT INTO master_categories (name) VALUES (?)`;
    const [result] = await dbPromise.query(sql, [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating category:', err);
    res.status(500).json({ error: 'Failed to create category' });
  }
};

exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `UPDATE master_categories SET name = ? WHERE id = ?`;
    await dbPromise.query(sql, [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating category:', err);
    res.status(500).json({ error: 'Failed to update category' });
  }
};

exports.deleteCategory = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM master_categories WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting category:', err);
    res.status(500).json({ error: 'Failed to delete category' });
  }
};


exports.getFeedbackTypes = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM master_feedback_types ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching feedback types:', err);
    res.status(500).json({ error: 'Failed to fetch feedback types' });
  }
};

exports.createFeedbackType = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `INSERT INTO master_feedback_types (name) VALUES (?)`;
    const [result] = await dbPromise.query(sql, [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating feedback type:', err);
    res.status(500).json({ error: 'Failed to create feedback type' });
  }
};

exports.updateFeedbackType = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `UPDATE master_feedback_types SET name = ? WHERE id = ?`;
    await dbPromise.query(sql, [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating feedback type:', err);
    res.status(500).json({ error: 'Failed to update feedback type' });
  }
};

exports.deleteFeedbackType = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM master_feedback_types WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting feedback type:', err);
    res.status(500).json({ error: 'Failed to delete feedback type' });
  }
};

exports.getStatusList = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM master_status ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching status list:', err);
    res.status(500).json({ error: 'Failed to fetch status list' });
  }
};

exports.createStatus = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `INSERT INTO master_status (name) VALUES (?)`;
    const [result] = await dbPromise.query(sql, [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating status:', err);
    res.status(500).json({ error: 'Failed to create status' });
  }
};

exports.updateStatus = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `UPDATE master_status SET name = ? WHERE id = ?`;
    await dbPromise.query(sql, [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating status:', err);
    res.status(500).json({ error: 'Failed to update status' });
  }
};

exports.deleteStatus = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM master_status WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting status:', err);
    res.status(500).json({ error: 'Failed to delete status' });
  }
};


// ===== Master Data: Priority Levels =====
exports.getPriorityLevels = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`SELECT * FROM feedback_priority_levels ORDER BY name`);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching priority levels:', err);
    res.status(500).json({ error: 'Failed to fetch priority levels' });
  }
};

exports.createPriorityLevel = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `INSERT INTO feedback_priority_levels (name) VALUES (?)`;
    const [result] = await dbPromise.query(sql, [name]);
    res.json({ id: result.insertId });
  } catch (err) {
    console.error('Error creating priority level:', err);
    res.status(500).json({ error: 'Failed to create priority level' });
  }
};

exports.updatePriorityLevel = async (req, res) => {
  try {
    const { name } = req.body;
    const sql = `UPDATE feedback_priority_levels SET name = ? WHERE id = ?`;
    await dbPromise.query(sql, [name, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating priority level:', err);
    res.status(500).json({ error: 'Failed to update priority level' });
  }
};

exports.deletePriorityLevel = async (req, res) => {
  try {
    await dbPromise.query(`DELETE FROM feedback_priority_levels WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting priority level:', err);
    res.status(500).json({ error: 'Failed to delete priority level' });
  }
};

//send email
exports.assignPIC = async (req, res) => {
  const { feedbackId, picEmail, picName } = req.body;

  try {
    // Update assignment in DB
    await dbPromise.query('UPDATE feedback_requests SET assigned_pic = ? WHERE id = ?', [picEmail, feedbackId]);

    // Send email
    await sendEmail({
      to: picEmail,
      subject: `New Feedback Assigned (ID: ${feedbackId})`,
      templateName: 'assign_pic',
      variables: {
        name: picName,
        ticket_id: feedbackId
      }
    });


    res.status(200).json({ message: 'Assigned and email sent' });
  } catch (err) {
    console.error('❌ Assign error:', err);
    res.status(500).json({ error: 'Failed to assign PIC' });
  }
};

//check escalation
exports.checkEscalations = async () => {
  try {
    console.log('[checkEscalations] Starting escalation check...');

    const [overdueFeedbacks] = await dbPromise.query(`
      SELECT fr.id, fr.assigned_pic, fr.escalation_level, 
             emp1.name AS pic_name, fpc2.email AS next_pic, emp2.name AS next_pic_name
      FROM feedback_requests fr
      LEFT JOIN employees emp1 ON fr.assigned_pic = emp1.email
      LEFT JOIN feedback_pic_config fpc ON fpc.email = fr.assigned_pic
      LEFT JOIN feedback_pic_config fpc2 ON fpc2.section_id = fr.section_id 
                                       AND fpc2.priority = fpc.priority + 1
                                       AND fpc2.status = 'Active'
      LEFT JOIN employees emp2 ON emp2.email = fpc2.email
      WHERE fr.status_id NOT IN (3,4)
      AND TIMESTAMPDIFF(HOUR, fr.updated_at, NOW()) > 
          (SELECT escalation_days * 24 FROM feedback_settings LIMIT 1)
    `);

    console.log(`[checkEscalations] Found ${overdueFeedbacks.length} overdue feedback(s).`);

    for (const feedback of overdueFeedbacks) {
      console.log(`\n[checkEscalations] Processing Feedback ID: ${feedback.id}`);

      if (feedback.next_pic) {
        console.log(`[checkEscalations] Escalating to next PIC: ${feedback.next_pic} (Level ${feedback.escalation_level + 1})`);

        await dbPromise.query(
          `UPDATE feedback_requests 
           SET assigned_pic = ?, escalation_level = escalation_level + 1, updated_at = NOW()
           WHERE id = ?`,
          [feedback.next_pic, feedback.id]
        );
        console.log(`[checkEscalations] Updated assigned_pic and escalation_level.`);

        await dbPromise.query(`
          INSERT INTO feedback_logs (feedback_id, event, timestamp)
          VALUES (?, ?, NOW())
        `, [
          feedback.id,
          `Auto escalation to ${feedback.next_pic_name} (Level ${feedback.escalation_level + 1})`
        ]);
        console.log(`[checkEscalations] Logged escalation.`);

        await sendEmail({
          to: feedback.next_pic,
          subject: `Escalated Feedback #${feedback.id}`,
          templateName: 'escalation_notice',
          variables: {
            ticket_id: feedback.id,
            previous_pic: feedback.pic_name,
            escalation_level: feedback.escalation_level + 1
          }
        });
        console.log(`[checkEscalations] Email sent to new PIC: ${feedback.next_pic}`);

        await dbPromise.query(`
          INSERT INTO feedback_logs (feedback_id, event, timestamp)
          VALUES (?, ?, NOW())
        `, [
          feedback.id,
          `Notification sent to new PIC ${feedback.next_pic_name}`
        ]);

        if (feedback.assigned_pic) {
          await sendEmail({
            to: feedback.assigned_pic,
            subject: `Feedback #${feedback.id} Escalated`,
            templateName: 'escalation_alert',
            variables: {
              ticket_id: feedback.id,
              new_pic: feedback.next_pic_name
            }
          });
          console.log(`[checkEscalations] Email sent to previous PIC: ${feedback.assigned_pic}`);

          await dbPromise.query(`
            INSERT INTO feedback_logs (feedback_id, event, timestamp)
            VALUES (?, ?, NOW())
          `, [
            feedback.id,
            `Notification sent to previous PIC ${feedback.pic_name}`
          ]);
        }

      } else {
        console.log(`[checkEscalations] No next PIC found. Notifying admins...`);

        const [adminEmails] = await dbPromise.query(
          `SELECT email FROM admin_users WHERE receive_escalations = 1`
        );

        console.log(`[checkEscalations] Found ${adminEmails.length} admin(s) to notify.`);

        for (const admin of adminEmails) {
          await sendEmail({
            to: admin.email,
            subject: `Unresolved Feedback #${feedback.id}`,
            templateName: 'admin_escalation',
            variables: {
              ticket_id: feedback.id,
              current_pic: feedback.pic_name
            }
          });
          console.log(`[checkEscalations] Admin notified: ${admin.email}`);
        }

        await dbPromise.query(`
          INSERT INTO feedback_logs (feedback_id, event, timestamp)
          VALUES (?, ?, NOW())
        `, [
          feedback.id,
          `Escalation failed – no next PIC found. Admins notified.`
        ]);
      }
    }

    console.log('[checkEscalations] Escalation check completed.\n');

  } catch (err) {
    console.error('❌ Escalation check error:', err);
  }
};

exports.runEscalationNow = async (req, res) => {
  try {
    await exports.checkEscalations();
    res.status(200).json({ message: 'Escalation check completed' });
  } catch (err) {
    console.error('❌ Error during escalation check:', err);
    res.status(500).json({ error: 'Failed to run escalation check' });
  }
};

exports.getDashboardStats = async (req, res) => {
  const [[total]] = await dbPromise.query(`SELECT COUNT(*) AS total FROM feedback_requests`);
  const [[open]] = await dbPromise.query(`SELECT COUNT(*) AS open FROM feedback_requests WHERE status_id = 1`);
  const [[resolved]] = await dbPromise.query(`SELECT COUNT(*) AS resolved FROM feedback_requests WHERE status_id = 3`);
  const [[escalated]] = await dbPromise.query(`SELECT COUNT(*) AS escalated FROM feedback_requests WHERE escalation_level > 0`);

  const [byType] = await dbPromise.query(`SELECT 
  mft.name, 
  COUNT(*) AS count
FROM 
  feedback_requests fr
INNER JOIN 
  hrms_2.master_feedback_types mft 
  ON fr.feedback_type_id = mft.id
GROUP BY 
  mft.name;`);
  const [bySection] = await dbPromise.query(`SELECT 
  ms.name, 
  COUNT(*) AS count
FROM 
  feedback_requests fr
INNER JOIN 
  hrms_2.master_sections ms 
  ON fr.section_id = ms.id
GROUP BY 
  ms.name;
`);

  res.json({
    total: total.total,
    open: open.open,
    resolved: resolved.resolved,
    escalated: escalated.escalated,
    byType,
    bySection
  });
};


