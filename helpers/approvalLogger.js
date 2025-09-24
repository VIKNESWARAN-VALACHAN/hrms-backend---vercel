const { dbPromise } = require('../models/db');

async function logApprovalAction({
  module,
  record_id,
  company_id,
  level,
  approver_id,
  approver_name,
  status,
  remark
}) {
  try {
    await dbPromise.query(
      `INSERT INTO approval_history
       (module, record_id, company_id, level, approver_id, approver_name, status, remark)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [module, record_id, company_id, level, approver_id, approver_name, status, remark]
    );
  } catch (err) {
    console.error('Failed to log approval history:', err);
  }
}

module.exports = { logApprovalAction };
