// cron/salarySync.js
const cron = require('node-cron');
const { dbPromise } = require('../models/db');

cron.schedule('5 0 * * *', async () => {
  try {
    await dbPromise.query(
      `
      UPDATE employees e
      JOIN (
        SELECT employee_id, MAX(effective_date) AS eff
        FROM employee_salary_increments
        WHERE effective_date <= CURDATE()
        GROUP BY employee_id
      ) last ON last.employee_id = e.id
      JOIN employee_salary_increments i
        ON i.employee_id = e.id AND i.effective_date = last.eff
      SET e.salary = i.new_salary
      `
    );
    console.log('[00:05] Salary sync completed');
  } catch (err) {
    console.error('[00:05] Salary sync failed:', err);
  }
});
