import cron from 'node-cron';
import { getQueueManager } from '../queue/QueueManager';
import { User } from '../database/models/User.model';
import { Application } from '../database/models/Application.model';
import { Email } from '../database/models/Email.model';
import { logger } from '../utils/logger';

export class CronScheduler {
  private queueManager;
  private jobs: Map<string, cron.ScheduledTask>;

  constructor() {
    this.queueManager = getQueueManager();
    this.jobs = new Map();
  }

  start() {
    logger.info('Starting cron scheduler...');

    // Daily job discovery at 9 AM
    this.scheduleDailyJobDiscovery();

    // Follow-up reminder check at 6 PM
    this.scheduleFollowUpReminders();

    // Status update check every 4 hours
    this.scheduleStatusUpdates();

    // Queue cleanup at midnight
    this.scheduleQueueCleanup();

    logger.info('All cron jobs scheduled');
  }

  private scheduleDailyJobDiscovery() {
    const cronExpression = process.env.JOB_DISCOVERY_CRON || '0 9 * * *'; // 9 AM daily

    const task = cron.schedule(cronExpression, async () => {
      logger.info('Cron: Starting daily job discovery');

      try {
        // Get all active users
        const users = await User.find({}).select('_id profile settings');

        for (const user of users) {
          // Skip if user has disabled auto-discovery
          if (user.settings.autoApprove === false) {
            continue;
          }

          // Add discovery job to queue
          await this.queueManager.addJob('job-discovery', 'daily-discovery', {
            userId: user._id.toString(),
            searchCriteria: {
              searchTerms: user.profile.preferredRoles,
              locations: ['Remote'],
              jobBoards: ['linkedin', 'indeed', 'angellist'],
              experienceLevel: 'entry-level',
              maxJobs: user.settings.dailyJobLimit || 50
            }
          });

          logger.info('Job discovery queued for user', { userId: user._id });
        }

        logger.info('Daily job discovery completed', { usersProcessed: users.length });

      } catch (error) {
        logger.error('Daily job discovery failed', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    this.jobs.set('daily-job-discovery', task);
    logger.info(`Daily job discovery scheduled: ${cronExpression}`);
  }

  private scheduleFollowUpReminders() {
    const task = cron.schedule('0 18 * * *', async () => { // 6 PM daily
      logger.info('Cron: Checking for follow-up reminders');

      try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDays() - 7);

        // Find applications submitted 7 days ago without response
        const applicationsToFollowUp = await Application.find({
          status: 'submitted',
          submittedAt: {
            $lte: sevenDaysAgo
          },
          responseReceived: { $exists: false }
        }).populate('userId jobId');

        for (const application of applicationsToFollowUp) {
          // Check if follow-up email already sent
          const existingFollowUp = await Email.findOne({
            applicationId: application._id,
            subject: { $regex: /follow.?up/i }
          });

          if (!existingFollowUp) {
            logger.info('Follow-up needed', {
              applicationId: application._id,
              submittedAt: application.submittedAt
            });

            // TODO: Create follow-up email
            // For now, just log
          }
        }

        logger.info('Follow-up check completed', {
          applicationsChecked: applicationsToFollowUp.length
        });

      } catch (error) {
        logger.error('Follow-up reminder check failed', error);
      }
    }, {
      timezone: 'America/New_York'
    });

    this.jobs.set('follow-up-reminders', task);
    logger.info('Follow-up reminders scheduled: 6 PM daily');
  }

  private scheduleStatusUpdates() {
    const task = cron.schedule('0 */4 * * *', async () => { // Every 4 hours
      logger.info('Cron: Running status updates');

      try {
        // Check for applications that might need status updates
        const pendingApplications = await Application.find({
          status: { $in: ['submitted', 'interviewing'] }
        });

        logger.info('Status update check completed', {
          pendingApplications: pendingApplications.length
        });

        // TODO: Check for responses (would need email integration)

      } catch (error) {
        logger.error('Status update check failed', error);
      }
    });

    this.jobs.set('status-updates', task);
    logger.info('Status updates scheduled: Every 4 hours');
  }

  private scheduleQueueCleanup() {
    const task = cron.schedule('0 0 * * *', async () => { // Midnight
      logger.info('Cron: Running queue cleanup');

      try {
        // Clean completed jobs older than 24 hours
        const queues = ['job-discovery', 'job-scoring', 'company-intel', 'application-creation'];

        for (const queueName of queues) {
          await this.queueManager.cleanQueue(queueName, 24 * 60 * 60 * 1000, 1000);
        }

        logger.info('Queue cleanup completed');

      } catch (error) {
        logger.error('Queue cleanup failed', error);
      }
    });

    this.jobs.set('queue-cleanup', task);
    logger.info('Queue cleanup scheduled: Midnight daily');
  }

  stop() {
    logger.info('Stopping all cron jobs...');

    for (const [name, task] of this.jobs) {
      task.stop();
      logger.info(`Cron job stopped: ${name}`);
    }

    this.jobs.clear();
  }

  getScheduledJobs() {
    const jobs: any = {};

    for (const [name, task] of this.jobs) {
      jobs[name] = {
        running: task.getStatus() === 'scheduled'
      };
    }

    return jobs;
  }

  // Manual trigger for testing
  async triggerJobDiscovery(userId?: string) {
    logger.info('Manually triggering job discovery', { userId });

    if (userId) {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await this.queueManager.addJob('job-discovery', 'manual-discovery', {
        userId: user._id.toString(),
        searchCriteria: {
          searchTerms: user.profile.preferredRoles,
          locations: ['Remote'],
          jobBoards: ['linkedin', 'indeed'],
          experienceLevel: 'entry-level',
          maxJobs: user.settings.dailyJobLimit || 50
        }
      });
    } else {
      // Trigger for all users
      const users = await User.find({});
      for (const user of users) {
        await this.queueManager.addJob('job-discovery', 'manual-discovery', {
          userId: user._id.toString(),
          searchCriteria: {
            searchTerms: user.profile.preferredRoles,
            locations: ['Remote'],
            jobBoards: ['linkedin', 'indeed'],
            experienceLevel: 'entry-level',
            maxJobs: user.settings.dailyJobLimit || 50
          }
        });
      }
    }

    logger.info('Job discovery triggered manually');
  }
}

// Singleton instance
let schedulerInstance: CronScheduler | null = null;

export function getScheduler(): CronScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new CronScheduler();
  }
  return schedulerInstance;
}