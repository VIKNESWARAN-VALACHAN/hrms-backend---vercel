// jobs/birthdayScheduler.js
const cron = require('node-cron');
const { __runDailyBirthdayWishes } = require('../controllers/notifications');

// Every day at 00:00 in Malaysia time
cron.schedule('0 0 * * *', async () => {
  console.log('[Cron] Running daily birthday wishes job…');
  await __runDailyBirthdayWishes();
}, { timezone: 'Asia/Kuala_Lumpur' });
