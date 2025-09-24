const cron = require('node-cron');
const { dbPromise } = require('../models/db');

const runRateExpiryCheck = async () => {
  try {
    const [result] = await dbPromise.query(`
      UPDATE currency_rates
      SET is_expired = 1
      WHERE expiry_date < CURDATE() AND is_expired = 0
    `);
    console.log(`[Cron] Rate expiry check completed. Rows affected: ${result.affectedRows}`);
  } catch (err) {
    console.error('[Cron] Rate expiry check failed:', err);
  }
};

// Run daily at midnight
cron.schedule('0 0 * * *', runRateExpiryCheck);

module.exports = { runRateExpiryCheck };
