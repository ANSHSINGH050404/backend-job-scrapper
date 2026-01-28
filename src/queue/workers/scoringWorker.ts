import { Job } from 'bullmq';
import { getQueueManager } from '../QueueManager';
import { JobScoringAgent } from '../../agents/scoring/JobScoringAgent';
import { Job as JobModel } from '../../database/models/Job.model';
import { User } from '../../database/models/User.model';
import { logger } from '../../utils/logger';

const queueManager = getQueueManager();

async function processJobScoring(job: Job) {
  const { userId, jobId } = job.data;

  logger.info('Processing job scoring', {
    jobId: job.id,
    targetJobId: jobId
  });

  try {
    await job.updateProgress(10);

    // Get job and user data
    const [jobData, user] = await Promise.all([
      JobModel.findById(jobId),
      User.findById(userId)
    ]);

    if (!jobData) {
      throw new Error('Job not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    await job.updateProgress(30);

    // Initialize agent
    const agent = new JobScoringAgent();

    // Execute scoring
    const result = await agent.execute({
      job: {
        id: jobData._id.toString(),
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        description: jobData.description,
        requirements: jobData.requirements,
        metadata: {
          experienceLevel: jobData.metadata.experienceLevel || 'entry-level'
        }
      },
      userProfile: {
        skills: user.profile.skills,
        experience: user.profile.experience,
        education: user.profile.education,
        preferredRoles: user.profile.preferredRoles,
        dealBreakers: user.profile.dealBreakers
      }
    });

    await job.updateProgress(70);

    // Update job with score
    await JobModel.findByIdAndUpdate(jobId, {
      score: result.score,
      scoringReason: result.reasoning,
      status: result.verdict === 'accept' ? 'scored' : 'rejected'
    });

    await job.updateProgress(90);

    // If score is high enough, trigger company intel
    if (result.score >= 70) {
      await queueManager.addJob('company-intel', 'research-company', {
        userId,
        jobId: jobData._id.toString(),
        companyName: jobData.company,
        companyUrl: jobData.url,
        jobUrl: jobData.url
      });
    }

    await job.updateProgress(100);

    logger.info('Job scoring completed', {
      jobId: job.id,
      targetJobId: jobId,
      score: result.score,
      verdict: result.verdict
    });

    return {
      success: true,
      jobId,
      score: result.score,
      verdict: result.verdict,
      reasoning: result.reasoning
    };

  } catch (error) {
    logger.error('Job scoring failed', {
      jobId: job.id,
      error
    });
    throw error;
  }
}

export function startScoringWorker() {
  const worker = queueManager.createWorker(
    'job-scoring',
    processJobScoring,
    3 // concurrency: 3 parallel jobs
  );

  logger.info('Job Scoring Worker started');
  return worker;
}