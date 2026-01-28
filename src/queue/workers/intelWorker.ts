import { Job } from 'bullmq';
import { getQueueManager } from '../QueueManager';
import { CompanyIntelAgent } from '../../agents/intel/CompanyIntelAgent';
import { Company } from '../../database/models/Company.model';
import { Job as JobModel } from '../../database/models/Job.model';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

const queueManager = getQueueManager();

async function processCompanyIntel(job: Job) {
  const { userId, jobId, companyName, companyUrl, jobUrl } = job.data;

  logger.info('Processing company intel', {
    jobId: job.id,
    companyName
  });

  try {
    await job.updateProgress(10);

    // Check if company data already exists and is fresh
    const existingCompany = await Company.findOne({ name: companyName });
    
    if (existingCompany && !existingCompany.isCacheStale()) {
      logger.info('Using cached company data', { companyName });
      
      // Link to job
      await JobModel.findByIdAndUpdate(jobId, {
        companyIntelId: existingCompany._id
      });

      await job.updateProgress(100);

      return {
        success: true,
        cached: true,
        companyId: existingCompany._id.toString()
      };
    }

    await job.updateProgress(30);

    // Initialize agent
    const agent = new CompanyIntelAgent();

    // Execute intel gathering
    const result = await agent.execute({
      companyName,
      companyUrl,
      jobUrl
    });

    await job.updateProgress(70);

    // Save or update company data
    let companyDoc;
    if (existingCompany) {
      companyDoc = await Company.findByIdAndUpdate(
        existingCompany._id,
        {
          ...result,
          cachedAt: new Date()
        },
        { new: true }
      );
    } else {
      companyDoc = await Company.create({
        name: companyName,
        url: companyUrl,
        ...result
      });
    }

    await job.updateProgress(90);

    // Link to job
    await JobModel.findByIdAndUpdate(jobId, {
      companyIntelId: companyDoc._id
    });

    await job.updateProgress(100);

    logger.info('Company intel completed', {
      jobId: job.id,
      companyName,
      foundersFound: result.founders.length,
      techStackSize: result.techStack.length
    });

    return {
      success: true,
      cached: false,
      companyId: companyDoc._id.toString(),
      foundersFound: result.founders.length,
      techStackSize: result.techStack.length
    };

  } catch (error) {
    logger.error('Company intel failed', {
      jobId: job.id,
      companyName,
      error
    });
    throw error;
  }
}

export function startIntelWorker() {
  const worker = queueManager.createWorker(
    'company-intel',
    processCompanyIntel,
    1 // concurrency: 1 to respect rate limits
  );

  logger.info('Company Intel Worker started');
  return worker;
}