const { dbPromise } = require('../models/db');
const { logApprovalAction } = require('../helpers/approvalLogger');

// ✅ Approve claim
exports.approveClaim = async (req, res) => {
  const claimId = req.params.id;
  const { approver_id, approver_name, remark = '' } = req.body;

  console.log('--- Incoming approval request ---');
  console.log('Claim ID:', claimId);
  console.log('Request Body:', req.body);

  if (!approver_id || !approver_name) {
    console.log('❌ Missing approver ID or name');
    return res.status(400).json({ error: 'Missing approver ID or name' });
  }

  try {
    console.log('🔍 Fetching claim from DB...');
    const [[claim]] = await dbPromise.query(`
      SELECT id, employee_id, company_id, current_approval_level, final_approval_level, amount, status
      FROM claim_requests
      WHERE id = ?`, [claimId]);

    if (!claim) {
      console.log('❌ Claim not found');
      return res.status(404).json({ error: 'Claim not found' });
    }

    console.log('✅ Claim found:', claim);

    if (claim.status === 'Approved' || claim.status === 'Rejected') {
      console.log(`⚠️ Claim already finalized. Status: ${claim.status}`);
      return res.status(400).json({ error: 'Claim already finalized' });
    }

    const level = claim.current_approval_level;
    console.log('📌 Current approval level:', level);

const [existing] = await dbPromise.query(`
  SELECT * FROM claim_approvals
  WHERE claim_id = ? AND approver_id = ? AND level = ?`,
  [claimId, approver_id, level]);

if (existing.length > 0 && existing[0].status === 'Pending') {
  await dbPromise.query(`
    UPDATE claim_approvals
    SET status = 'Approved', remark = ?, action_date = NOW()
    WHERE id = ?`,
    [remark, existing[0].id]);
} else if (existing.length > 0) {
  return res.status(400).json({ error: 'You have already approved this level' });
} else {
  await dbPromise.query(`
    INSERT INTO claim_approvals (claim_id, approver_id, level, status, remark, action_date)
    VALUES (?, ?, ?, 'Approved', ?, NOW())`,
    [claimId, approver_id, level, remark]);
}


    console.log('🧾 Logging approval action...');
    await logApprovalAction({
      module: 'claim',
      record_id: claimId,
      company_id: claim.company_id,
      level,
      approver_id,
      approver_name,
      status: 'Approved',
      remark
    });

    console.log('🔢 Checking total approvals at current level...');
    const [[{ total_approvers }]] = await dbPromise.query(`
      SELECT COUNT(*) AS total_approvers
      FROM claim_approvals
      WHERE claim_id = ? AND level = ?`,
      [claimId, level]);

    console.log(`🧮 Approvals so far: ${total_approvers}`);

    const expected_approvers = 1;

    if (total_approvers >= expected_approvers) {
      const nextLevel = level + 1;

      if (nextLevel > claim.final_approval_level) {
        console.log('🏁 Final approval reached. Approving claim...');
        await dbPromise.query(`
          UPDATE claim_requests
          SET status = 'Approved',
              approved_amount = ?,
              admin_remark = ?,
              updated_by = ?
          WHERE id = ?`,
          [claim.amount, `${approver_name}: ${remark}`, approver_id, claimId]);

        console.log('✅ Claim fully approved.');
        return res.json({ success: true, message: 'Claim fully approved' });
      } else {
        console.log('➡️ Moving to next approval level:', nextLevel);
        await dbPromise.query(`
          UPDATE claim_requests SET current_approval_level = ?, status = 'Under Review'
          WHERE id = ?`, [nextLevel, claimId]);

        console.log('✅ Level approved. Awaiting next approver.');
        return res.json({ success: true, message: 'Level approved. Moving to next level.' });
      }
    } else {
      console.log('⌛ Waiting for more approvals...');
      return res.json({ success: true, message: 'Your approval saved. Waiting for others.' });
    }
  } catch (err) {
    console.error('❌ Error approving claim:', err);
    return res.status(500).json({ error: 'Internal error during approval' });
  }
};


exports.rejectClaim = async (req, res) => {
  const claimId = req.params.id;
  const { approver_id, approver_name, remark = '' } = req.body;

  // Validate required fields
  if (!approver_id || !approver_name) {
    return res.status(400).json({ 
      error: 'Missing required fields',
      details: {
        required: ['approver_id', 'approver_name'],
        received: req.body
      }
    });
  }

  try {
    // Get claim details including current status
    const [[claim]] = await dbPromise.query(`
      SELECT id, employee_id, company_id, benefit_type_id, amount, 
             current_approval_level, status
      FROM claim_requests 
      WHERE id = ?`,
      [claimId]);

    if (!claim) {
      return res.status(404).json({ 
        error: 'Claim not found',
        claimId
      });
    }

    // Check if claim is already processed
    if (claim.status === 'Approved' || claim.status === 'Rejected') {
      return res.status(400).json({
        error: 'Claim already processed',
        currentStatus: claim.status,
        claimId
      });
    }

    const level = claim.current_approval_level;

    // Check for existing approval record
    const [existing] = await dbPromise.query(`
      SELECT * FROM claim_approvals
      WHERE claim_id = ? AND approver_id = ? AND level = ?`,
      [claimId, approver_id, level]);

    // Update or create approval record
    if (existing.length > 0) {
      if (existing[0].status === 'Pending') {
        await dbPromise.query(`
          UPDATE claim_approvals
          SET status = 'Rejected', remark = ?, action_date = NOW()
          WHERE id = ?`,
          [remark, existing[0].id]);
      } else {
        return res.status(400).json({ 
          error: 'You have already taken action on this level',
          previousAction: existing[0].status
        });
      }
    } else {
      await dbPromise.query(`
        INSERT INTO claim_approvals (claim_id, approver_id, level, status, remark, action_date)
        VALUES (?, ?, ?, 'Rejected', ?, NOW())`,
        [claimId, approver_id, level, remark]);
    }

    // Revert the claimed amount in employee_benefits
    await dbPromise.query(
      `UPDATE employee_benefits
       SET claimed = GREATEST(claimed - ?, 0),
           updated_at = NOW()
       WHERE employee_id = ? AND benefit_type_id = ?`,
      [claim.amount, claim.employee_id, claim.benefit_type_id]
    );

    // Update claim with complete rejection details
    await dbPromise.query(`
      UPDATE claim_requests 
      SET 
        status = 'Rejected',
        approved_amount = 0,
        admin_remark = ?,
        updated_by = ?,
        updated_at = NOW()
      WHERE id = ?`, 
      [
        `Rejected by ${approver_name}: ${remark}`, // admin_remark
        approver_id,                              // updated_by
        claimId
      ]
    );

    // Log rejection
    await logApprovalAction({
      module: 'claim',
      record_id: claimId,
      company_id: claim.company_id,
      level,
      approver_id,
      approver_name,
      status: 'Rejected',
      remark
    });

    res.json({ 
      success: true, 
      message: 'Claim rejected successfully',
      claimId,
      rejectedBy: approver_name,
      rejectedAt: new Date().toISOString()
    });

  } catch (err) {
    console.error('Error rejecting claim:', {
      claimId,
      error: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString()
    });
    
    res.status(500).json({ 
      error: 'Internal server error during rejection',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Get approval history
exports.getApprovalHistory = async (req, res) => {
  try {
    const [rows] = await dbPromise.query(`
      SELECT ca.*, e.name AS approver_name
      FROM claim_approvals ca
      JOIN employees e ON ca.approver_id = e.id
      WHERE ca.claim_id = ?
      ORDER BY level ASC, ca.action_date DESC
    `, [req.params.id]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching history:', err);
    res.status(500).json({ error: 'Failed to get approval history' });
  }
};

// ✅ Get current status by level
exports.getCurrentApprovalStatus = async (req, res) => {
  try {
    const claimId = req.params.id;
    const [rows] = await dbPromise.query(`
      SELECT level, approver_id, ca.status, remark, action_date, e.name AS approver_name
      FROM claim_approvals ca
      JOIN employees e ON ca.approver_id = e.id
      WHERE claim_id = ?
      ORDER BY level ASC, action_date DESC
    `, [claimId]);

    res.json(rows);
  } catch (err) {
    console.error('Error fetching current approval status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};


exports.getApprovalHistoryDetails = async (req, res) => {
  const { module, record_id } = req.query;

  if (!module || !record_id) {
    return res.status(400).json({ error: 'Missing module or record_id' });
  }

  try {
    const [rows] = await dbPromise.query(
      `SELECT * FROM approval_history
       WHERE module = ? AND record_id = ?
       ORDER BY approved_at ASC`,
      [module, record_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching approval history:', err);
    res.status(500).json({ error: 'Failed to fetch approval history' });
  }
};

exports.getClaimDetails = async (req, res) => {
    const claimId = req.params.id; // Assuming the claim ID comes from the URL parameter

    if (!claimId) {
        return res.status(400).json({ error: 'Claim ID is required.' });
    }

    const conn = await dbPromise.getConnection(); // Get a connection from the pool
    try {
        // 1. Fetch the main claim request details
        const [claimDetailsRows] = await conn.query(
            `SELECT
                cr.*,
                bt.name AS benefit_type_name,
                e.name AS employee_name,
                d.department_name AS department_name, -- Assuming 'department_name' is also useful
                c.name AS company_name
             FROM claim_requests cr
             INNER JOIN employees e ON cr.employee_id = e.id
             INNER JOIN benefit_types bt ON cr.benefit_type_id = bt.id
             INNER JOIN companies c ON cr.company_id = c.id
             LEFT JOIN departments d ON e.department_id = d.id -- Assuming employees can have departments
             WHERE cr.id = ?`,
            [claimId]
        );

        if (claimDetailsRows.length === 0) {
            return res.status(404).json({ error: 'Claim request not found.' });
        }

        const claim = claimDetailsRows[0];

        // 2. Fetch the full approval history for the claim
        const module = 'claim'; // As defined in your createClaim function
        const [approvalHistoryRows] = await conn.query(
            `SELECT * FROM approval_history
             WHERE module = ? AND record_id = ?
             ORDER BY approved_at ASC`, // Or order by action_date if you use that
            [module, claimId]
        );

        // 3. Fetch the current claim approval statuses (who needs to approve next, their current status)
        const [claimApprovalsRows] = await conn.query(
            `SELECT level, approver_id, ca.status, remark, action_date, e.name AS approver_name
             FROM claim_approvals ca
             JOIN employees e ON ca.approver_id = e.id
             WHERE claim_id = ?
             ORDER BY level ASC, action_date DESC`, // Order by level, then latest action if multiple actions per level
            [claimId]
        );

        // Combine all data into a single response object
        const responseData = {
            claimDetails: claim,
            approvalHistory: approvalHistoryRows,
            currentApprovals: claimApprovalsRows // You might want to process this further to get unique approvers per level if needed
        };

        res.status(200).json(responseData);

    } catch (err) {
        console.error('Error fetching claim details:', err);
        res.status(500).json({ error: 'Failed to fetch claim details.' });
    } finally {
        conn.release(); // Release the connection back to the pool
    }
};