const { processAutoRenewals } = require('../services/autoRenewalService');

const renewalJob = async () => {
  const startTime = new Date();
  console.log(`[Cron] Auto-renewal job started at ${startTime.toISOString()}`);

  try {
    const result = await processAutoRenewals({
      dryRun: false,
      gracePeriodDays: 7,
      advanceNoticeDays: null
    });

    const endTime = new Date();
    const duration = endTime - startTime;

    console.log(`[Cron] Auto-renewal completed in ${duration}ms`);
    console.log(`[Cron] Processed: ${result.totalProcessed}, Successful: ${result.successful}, Failed: ${result.failed}`);

    if (result.failed > 0) {
      console.error('[Cron] Failed renewals:', result.results.filter(r => r.status === 'failed'));
    }

  } catch (err) {
    const endTime = new Date();
    const duration = endTime - startTime;
    console.error(`[Cron] Auto-renewal failed after ${duration}ms:`, err.message);
  }
};

module.exports = { renewalJob };
