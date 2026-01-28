import { Job } from 'bullmq';
import { getQueueManager } from '../QueueManager';
import { JobDiscoveryAgent } from '../../agents/discovery/JobDiscoveryAgent';
import { Job as JobModel } from '../../database/models/Job.model';
import { User } from '../../database/models/User.model';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

const queueManager = getQueueManager();

// Job processor function
async function processJobDiscovery(job: Job) {
  const { userId, searchCriteria } = job.data;

  logger.info('Processing job discovery', {
    jobId: job.id,
    userId
  });

  try {
    // Update progress
    await job.updateProgress(10);

    // Get user profile for search customization
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    await job.updateProgress(20);

    // Initialize agent
    const agent = new JobDiscoveryAgent();

    // Merge user preferences with search criteria
    const fullCriteria = {
      searchTerms: searchCriteria.searchTerms || user.profile.preferredRoles,
      locations: searchCriteria.locations || ['Remote'],
      jobBoards: searchCriteria.jobBoards || ['linkedin', 'indeed'],
      experienceLevel: 'entry-level',
      maxJobs: searchCriteria.maxJobs || user.settings.dailyJobLimit || 50
    };

    await job.updateProgress(30);

    // Execute discovery
    const result = await agent.execute(fullCriteria);

    await job.updateProgress(60);

    // Save discovered jobs to database
    let savedCount = 0;
    const jobIds: string[] = [];

    for (const jobData of result.jobs) {
      try {
        // Check if job already exists (by URL)
        const existingJob = await JobModel.findOne({ url: jobData.url });
        
        if (!existingJob) {
          const newJob = await JobModel.create({
            userId: new mongoose.Types.ObjectId(userId),
            title: jobData.title,
            company: jobData.company,
            location: jobData.location,
            url: jobData.url,
            source: jobData.source,
            description: jobData.description,
            requirements: jobData.requirements,
            postedDate: jobData.postedDate,
            discoveredAt: new Date(),
            status: 'discovered',
            metadata: {
              salary: jobData.salary,
              remote: jobData.remote,
              experienceLevel: 'entry-level'
            }
          });

          savedCount++;
          jobIds.push(newJob._id.toString());

          // Add to scoring queue
          await queueManager.addJob('job-scoring', 'score-job', {
            userId,
            jobId: newJob._id.toString()
          });
        }

      } catch (error) {
        logger.error('Failed to save job', { error, job: jobData });
      }
    }

    await job.updateProgress(90);

    // Update user stats
    await User.findByIdAndUpdate(userId, {
      $inc: { 'stats.jobsDiscovered': savedCount }
    });

    await job.updateProgress(100);

    logger.info('Job discovery completed', {
      jobId: job.id,
      totalFound: result.totalFound,
      saved: savedCount,
      userId
    });

    return {
      success: true,
      totalFound: result.totalFound,
      savedCount,
      jobIds,
      timestamp: new Date()
    };

  } catch (error) {
    logger.error('Job discovery failed', {
      jobId: job.id,
      error,
      userId
    });
    throw error;
  }
}

// Create worker
export function startDiscoveryWorker() {
  const worker = queueManager.createWorker(
    'job-discovery',
    processJobDiscovery,
    2 // concurrency: 2 parallel jobs
  );

  logger.info('Job Discovery Worker started');
  return worker;
}