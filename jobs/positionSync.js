// cron/positionSync.js
const cron = require('node-cron');
const { dbPromise } = require('../models/db');

/**
 * Runs daily at 00:07.
 * Logic:
 *  - For each employee, find the latest position record with start_date <= CURDATE()
 *  - Break ties by created_at DESC then id DESC
 *  - Write position_id, title, department_id, job_level to employees
 */
cron.schedule('7 0 * * *', async () => {
  try {
    const sql = `
      UPDATE employees e
      JOIN (
        SELECT x.employee_id, x.position_id, x.start_date
        FROM (
          SELECT
            epp.*,
            ROW_NUMBER() OVER (
              PARTITION BY epp.employee_id
              ORDER BY epp.start_date DESC, epp.created_at DESC, epp.id DESC
            ) AS rn
          FROM employee_past_positions epp
          WHERE epp.start_date <= CURDATE()
        ) x
        WHERE x.rn = 1
      ) cur ON cur.employee_id = e.id
      JOIN positions p ON p.id = cur.position_id
      SET
        e.position_id = p.id,
        e.position = p.title,
        e.department_id = p.department_id,
        e.job_level = p.job_level,
        e.current_position_start_date = cur.start_date
    `;

    await dbPromise.query(sql);
    console.log('[00:07] Position sync completed');
  } catch (err) {
    console.error('[00:07] Position sync failed:', err);
  }
});
