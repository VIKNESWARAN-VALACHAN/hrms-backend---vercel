const { dbPromise } = require('../models/db');

exports.runBenefitRenewalJob = async (processed_by, job_type = 'scheduled') => {
  const startTime = new Date();
  let jobId = null;
  let processed = 0, success = 0, failed = 0, skipped = 0;

  try {
    const [job] = await dbPromise.query(`
      INSERT INTO renewal_job_log (start_time, job_type, job_status, processed_by)
      VALUES (?, ?, 'running', ?)`, [startTime, job_type, processed_by]);

    jobId = job.insertId;

    const [rows] = await dbPromise.query(`
      SELECT * FROM employee_benefits
      WHERE is_active = 1
        AND (
          (frequency = 'Yearly' AND effective_to = CURDATE())
          OR
          (frequency = 'Monthly' AND effective_to = LAST_DAY(CURDATE()))
        )
    `);

    for (const row of rows) {
      processed++;
      try {
        const newFrom = new Date();
        const newTo = new Date(newFrom);

        if (row.frequency === 'Yearly') newTo.setFullYear(newTo.getFullYear() + 1);
        else newTo.setMonth(newTo.getMonth() + 1);

        const [result] = await dbPromise.query(`
          INSERT INTO employee_benefits (employee_id, benefit_type_id, company_id, entitled, claimed, frequency, effective_from, effective_to, is_active)
          VALUES (?, ?, ?, ?, 0, ?, ?, ?, 1)
        `, [row.employee_id, row.benefit_type_id, row.company_id, row.entitled, row.frequency, newFrom, newTo]);

        const newId = result.insertId;

        await dbPromise.query(`
          INSERT INTO benefit_renewal_audit (
            original_benefit_id, new_benefit_id, employee_id, benefit_type_id, company_id,
            renewal_type, old_effective_from, old_effective_to, new_effective_from, new_effective_to,
            old_entitled, new_entitled, frequency, renewal_status, processed_by
          ) VALUES (?, ?, ?, ?, ?, 'automatic', ?, ?, ?, ?, ?, ?, ?, 'success', ?)
        `, [
          row.id, newId, row.employee_id, row.benefit_type_id, row.company_id,
          row.effective_from, row.effective_to, newFrom, newTo,
          row.entitled, row.entitled, row.frequency, processed_by
        ]);

        success++;
      } catch (err) {
        failed++;
        await dbPromise.query(`
          INSERT INTO benefit_renewal_audit (
            original_benefit_id, employee_id, benefit_type_id, company_id,
            renewal_type, old_effective_from, old_effective_to, old_entitled,
            frequency, renewal_status, failure_reason, processed_by
          ) VALUES (?, ?, ?, ?, 'automatic', ?, ?, ?, ?, 'failed', ?, ?)
        `, [
          row.id, row.employee_id, row.benefit_type_id, row.company_id,
          row.effective_from, row.effective_to, row.entitled,
          row.frequency, err.message, processed_by
        ]);
      }
    }

    const endTime = new Date();
    await dbPromise.query(`
      UPDATE renewal_job_log
      SET end_time = ?, duration_ms = ?, total_processed = ?, successful_renewals = ?, failed_renewals = ?, job_status = 'completed'
      WHERE id = ?`,
      [endTime, endTime - startTime, processed, success, failed, jobId]);

  } catch (error) {
    console.error('Job failed:', error);
    if (jobId) {
      await dbPromise.query(`
        UPDATE renewal_job_log SET job_status = 'failed', error_message = ?
        WHERE id = ?`, [error.message, jobId]);
    }
  }
};
