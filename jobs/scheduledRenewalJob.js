const cron = require('node-cron');
const AutoRenewalService = require('./autoRenewalService');

class ScheduledRenewalJob {
    constructor(dbConfig, options = {}) {
        this.autoRenewalService = new AutoRenewalService(dbConfig);
        this.options = {
            // Default to run daily at 2 AM
            cronSchedule: options.cronSchedule || '0 2 * * *',
            gracePeriodDays: options.gracePeriodDays || 7,
            advanceNoticeDays: options.advanceNoticeDays || null,
            enableNotifications: options.enableNotifications || false,
            notificationEmail: options.notificationEmail || null,
            ...options
        };
        this.isRunning = false;
        this.lastRunResult = null;
        this.scheduledTask = null;
    }

    /**
     * Start the scheduled renewal job
     */
    start() {
        if (this.scheduledTask) {
            console.log('Scheduled renewal job is already running');
            return;
        }

        console.log(`Starting scheduled renewal job with cron: ${this.options.cronSchedule}`);
        
        this.scheduledTask = cron.schedule(this.options.cronSchedule, async () => {
            await this.executeRenewalJob();
        }, {
            scheduled: true,
            timezone: this.options.timezone || 'UTC'
        });

        console.log('Scheduled renewal job started successfully');
    }

    /**
     * Stop the scheduled renewal job
     */
    stop() {
        if (this.scheduledTask) {
            this.scheduledTask.stop();
            this.scheduledTask = null;
            console.log('Scheduled renewal job stopped');
        }
    }

    /**
     * Execute the renewal job
     */
    async executeRenewalJob() {
        if (this.isRunning) {
            console.log('Renewal job is already running, skipping this execution');
            return;
        }

        this.isRunning = true;
        const startTime = new Date();
        
        try {
            console.log(`Starting auto-renewal job at ${startTime.toISOString()}`);

            const result = await this.autoRenewalService.processAutoRenewals({
                dryRun: false,
                gracePeriodDays: this.options.gracePeriodDays,
                advanceNoticeDays: this.options.advanceNoticeDays
            });

            const endTime = new Date();
            const duration = endTime - startTime;

            this.lastRunResult = {
                startTime,
                endTime,
                duration,
                result,
                status: 'success'
            };

            console.log(`Auto-renewal job completed successfully in ${duration}ms`);
            console.log(`Processed: ${result.totalProcessed}, Successful: ${result.successful}, Failed: ${result.failed}`);

            // Send notification if enabled
            if (this.options.enableNotifications) {
                await this.sendNotification(this.lastRunResult);
            }

            // Log detailed results if there were failures
            if (result.failed > 0) {
                console.error('Failed renewals:', result.results.filter(r => r.status === 'failed'));
            }

        } catch (error) {
            const endTime = new Date();
            const duration = endTime - startTime;

            this.lastRunResult = {
                startTime,
                endTime,
                duration,
                error: error.message,
                status: 'failed'
            };

            console.error(`Auto-renewal job failed after ${duration}ms:`, error);

            // Send error notification if enabled
            if (this.options.enableNotifications) {
                await this.sendErrorNotification(this.lastRunResult);
            }

        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Send success notification
     */
    async sendNotification(result) {
        try {
            // Implement your notification logic here
            // This could be email, Slack, webhook, etc.
            
            const message = `
Auto-Renewal Job Completed Successfully

Start Time: ${result.startTime.toISOString()}
End Time: ${result.endTime.toISOString()}
Duration: ${result.duration}ms

Results:
- Total Processed: ${result.result.totalProcessed}
- Successful: ${result.result.successful}
- Failed: ${result.result.failed}

${result.result.failed > 0 ? 'Please check the logs for failed renewal details.' : ''}
            `;

            console.log('Notification sent:', message);
            
            // Example: Send email notification
            // await this.sendEmail(this.options.notificationEmail, 'Auto-Renewal Job Completed', message);
            
        } catch (error) {
            console.error('Failed to send notification:', error);
        }
    }

    /**
     * Send error notification
     */
    async sendErrorNotification(result) {
        try {
            const message = `
Auto-Renewal Job Failed

Start Time: ${result.startTime.toISOString()}
End Time: ${result.endTime.toISOString()}
Duration: ${result.duration}ms

Error: ${result.error}

Please check the application logs for more details.
            `;

            console.log('Error notification sent:', message);
            
            // Example: Send email notification
            // await this.sendEmail(this.options.notificationEmail, 'Auto-Renewal Job Failed', message);
            
        } catch (error) {
            console.error('Failed to send error notification:', error);
        }
    }

    /**
     * Get the status of the scheduled job
     */
    getStatus() {
        return {
            isScheduled: !!this.scheduledTask,
            isRunning: this.isRunning,
            cronSchedule: this.options.cronSchedule,
            lastRunResult: this.lastRunResult,
            nextRun: this.scheduledTask ? 'Check cron schedule' : null
        };
    }

    /**
     * Run the job manually (outside of schedule)
     */
    async runManually() {
        console.log('Running auto-renewal job manually...');
        await this.executeRenewalJob();
        return this.lastRunResult;
    }
}

// Example usage and configuration
const createScheduledRenewalJob = (dbConfig, customOptions = {}) => {
    const defaultOptions = {
        // Run daily at 2 AM
        cronSchedule: '0 2 * * *',
        
        // Grace period: 7 days after expiry
        gracePeriodDays: 7,
        
        // Advance notice: 30 days for yearly, 3 days for monthly (null uses defaults)
        advanceNoticeDays: null,
        
        // Enable notifications
        enableNotifications: true,
        
        // Notification email
        notificationEmail: 'hr@company.com',
        
        // Timezone
        timezone: 'UTC'
    };

    const options = { ...defaultOptions, ...customOptions };
    return new ScheduledRenewalJob(dbConfig, options);
};

module.exports = {
    ScheduledRenewalJob,
    createScheduledRenewalJob
};

// Example of how to start the scheduled job in your main application:
/*
const { createScheduledRenewalJob } = require('./scheduledRenewalJob');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
};

// Create and start the scheduled job
const renewalJob = createScheduledRenewalJob(dbConfig, {
    cronSchedule: '0 2 * * *', // Daily at 2 AM
    enableNotifications: true,
    notificationEmail: 'hr@yourcompany.com'
});

renewalJob.start();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down...');
    renewalJob.stop();
    process.exit(0);
});
*/

