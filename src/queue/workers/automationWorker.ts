import { Job } from 'bullmq';
import { getQueueManager } from '../QueueManager';
import { ApplicationWriterAgent } from '../../agents/writer/ApplicationWriterAgent';
import { OutreachEmailAgent } from '../../agents/outreach/OutreachEmailAgent';
import { Application } from '../../database/models/Application.model';
import { Email } from '../../database/models/Email.model';
import { ApprovalService } from '../../services/ApprovalService';
import { Job as JobModel } from '../../database/models/Job.model';
import { Company } from '../../database/models/Company.model';
import { User } from '../../database/models/User.model';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';

const queueManager = getQueueManager();
const approvalService = new ApprovalService();

async function processApplicationCreation(job: Job) {
  const { userId, jobId } = job.data;

  logger.info('Processing application creation', {
    jobId: job.id,
    targetJobId: jobId
  });

  try {
    await job.updateProgress(10);

    // Get all required data
    const [jobData, user] = await Promise.all([
      JobModel.findById(jobId).populate('companyIntelId'),
      User.findById(userId)
    ]);

    if (!jobData) {
      throw new Error('Job not found');
    }

    if (!user) {
      throw new Error('User not found');
    }

    let companyIntel = jobData.companyIntelId as any;

    // If no company intel, fetch it
    if (!companyIntel) {
      companyIntel = await Company.findOne({ name: jobData.company });
      if (!companyIntel) {
        throw new Error('Company intel not found. Run intel agent first.');
      }
    }

    await job.updateProgress(30);

    // Initialize writer agent
    const writerAgent = new ApplicationWriterAgent();

    // Create application content
    const applicationContent = await writerAgent.execute({
      job: {
        title: jobData.title,
        company: jobData.company,
        location: jobData.location,
        description: jobData.description,
        requirements: jobData.requirements,
        metadata: {
          remote: jobData.metadata.remote,
          salary: jobData.metadata.salary
        }
      },
      company: {
        companyName: companyIntel.name,
        industry: companyIntel.industry,
        size: companyIntel.size,
        description: companyIntel.description,
        techStack: companyIntel.techStack,
        founders: companyIntel.founders,
        culture: companyIntel.culture,
        recentNews: companyIntel.recentNews
      },
      userProfile: {
        name: user.name,
        email: user.email,
        phone: user.phone,
        resume: user.profile.resume,
        projects: [],
        skills: user.profile.skills,
        education: user.profile.education,
        experience: user.profile.experience,
        achievements: [],
        portfolioUrl: user.profile.portfolioUrl,
        githubUrl: user.profile.githubUrl
      }
    });

    await job.updateProgress(50);

    // Create application record
    const application = await Application.create({
      userId: new mongoose.Types.ObjectId(userId),
      jobId: new mongoose.Types.ObjectId(jobId),
      status: 'draft',
      coverLetter: applicationContent.coverLetter,
      formAnswers: applicationContent.formAnswers,
      emailSent: false,
      timeline: [{
        status: 'draft',
        timestamp: new Date(),
        note: 'Application created by agent'
      }]
    });

    await job.updateProgress(70);

    // Create outreach email if founders found
    let emailCreated = false;
    if (companyIntel.founders && companyIntel.founders.length > 0) {
      const founder = companyIntel.founders[0];
      
      // Only create email if we have contact info
      if (founder.email) {
        const outreachAgent = new OutreachEmailAgent();

        // Find top project from user
        const topProject = user.profile.portfolioUrl ? {
          name: 'Portfolio',
          description: 'Personal portfolio showcasing projects',
          techStack: user.profile.skills.slice(0, 3),
          url: user.profile.portfolioUrl
        } : undefined;

        const emailContent = await outreachAgent.execute({
          recipient: {
            name: founder.name,
            role: founder.role,
            email: founder.email
          },
          company: {
            companyName: companyIntel.name,
            industry: companyIntel.industry,
            description: companyIntel.description,
            techStack: companyIntel.techStack,
            founders: companyIntel.founders,
            recentNews: companyIntel.recentNews,
            culture: companyIntel.culture
          },
          job: {
            title: jobData.title,
            requirements: jobData.requirements,
            location: jobData.location,
            metadata: {
              remote: jobData.metadata.remote
            }
          },
          userProfile: {
            name: user.name,
            currentStatus: `${user.profile.experience === 0 ? 'Recent graduate' : 'Software developer'} with ${user.profile.experience} years experience`,
            topSkills: user.profile.skills.slice(0, 5),
            portfolioUrl: user.profile.portfolioUrl,
            githubUrl: user.profile.githubUrl,
            topProject
          }
        });

        // Create email record
        const email = await Email.create({
          userId: new mongoose.Types.ObjectId(userId),
          applicationId: application._id,
          recipient: {
            name: founder.name,
            email: founder.email,
            role: founder.role
          },
          subject: emailContent.subject,
          body: emailContent.body,
          status: 'draft'
        });

        // Request approval for email
        await approvalService.requestEmailApproval(
          userId,
          email._id.toString(),
          {
            recipient: {
              name: founder.name,
              email: founder.email,
              role: founder.role
            },
            subject: emailContent.subject,
            body: emailContent.body,
            applicationId: application._id.toString()
          }
        );

        application.emailId = email._id;
        await application.save();

        emailCreated = true;
      }
    }

    await job.updateProgress(90);

    // Request approval for application
    await approvalService.requestApplicationApproval(
      userId,
      application._id.toString(),
      {
        coverLetter: applicationContent.coverLetter,
        formAnswers: applicationContent.formAnswers,
        jobTitle: jobData.title,
        company: jobData.company
      }
    );

    await job.updateProgress(100);

    logger.info('Application creation completed', {
      jobId: job.id,
      applicationId: application._id.toString(),
      emailCreated
    });

    return {
      success: true,
      applicationId: application._id.toString(),
      emailCreated,
      awaitingApproval: true
    };

  } catch (error) {
    logger.error('Application creation failed', {
      jobId: job.id,
      error
    });
    throw error;
  }
}

export function startApplicationWorker() {
  const worker = queueManager.createWorker(
    'application-creation',
    processApplicationCreation,
    2 // concurrency: 2 parallel applications
  );

  logger.info('Application Creation Worker started');
  return worker;
}