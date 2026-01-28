import { Queue, Worker, QueueEvents, Job } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

export class QueueManager {
  private connection: Redis;
  private queues: Map<string, Queue>;
  private workers: Map<string, Worker>;
  private events: Map<string, QueueEvents>;

  constructor() {
    this.connection = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      enableReadyCheck: false
    });

    this.queues = new Map();
    this.workers = new Map();
    this.events = new Map();

    this.connection.on('connect', () => {
      logger.info('Redis connected for BullMQ');
    });

    this.connection.on('error', (err) => {
      logger.error('Redis connection error', err);
    });
  }

  createQueue(name: string): Queue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }

    const queue = new Queue(name, {
      connection: this.connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000
        },
        removeOnComplete: {
          count: 100,
          age: 24 * 3600 // 24 hours
        },
        removeOnFail: {
          count: 500,
          age: 7 * 24 * 3600 // 7 days
        }
      }
    });

    this.queues.set(name, queue);

    // Setup queue events
    this.setupQueueEvents(name);

    logger.info(`Queue created: ${name}`);
    return queue;
  }

  createWorker(
    name: string,
    processor: (job: Job) => Promise<any>,
    concurrency: number = 1
  ): Worker {
    if (this.workers.has(name)) {
      return this.workers.get(name)!;
    }

    const worker = new Worker(name, processor, {
      connection: this.connection,
      concurrency,
      limiter: {
        max: 10,
        duration: 60000 // 10 jobs per minute
      }
    });

    // Worker event handlers
    worker.on('completed', (job) => {
      logger.info(`Job completed: ${job.id}`, {
        queue: name,
        data: job.returnvalue
      });
    });

    worker.on('failed', (job, err) => {
      logger.error(`Job failed: ${job?.id}`, {
        queue: name,
        error: err.message,
        attempts: job?.attemptsMade
      });
    });

    worker.on('error', (err) => {
      logger.error(`Worker error in queue: ${name}`, err);
    });

    this.workers.set(name, worker);

    logger.info(`Worker created for queue: ${name} (concurrency: ${concurrency})`);
    return worker;
  }

  private setupQueueEvents(name: string) {
    const queueEvents = new QueueEvents(name, {
      connection: this.connection
    });

    queueEvents.on('waiting', ({ jobId }) => {
      logger.debug(`Job waiting: ${jobId} in queue: ${name}`);
    });

    queueEvents.on('active', ({ jobId }) => {
      logger.debug(`Job active: ${jobId} in queue: ${name}`);
    });

    queueEvents.on('progress', ({ jobId, data }) => {
      logger.debug(`Job progress: ${jobId}`, { progress: data });
    });

    this.events.set(name, queueEvents);
  }

  async addJob(
    queueName: string,
    jobName: string,
    data: any,
    options?: any
  ): Promise<Job> {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    const job = await queue.add(jobName, data, options);
    logger.info(`Job added to queue: ${queueName}`, {
      jobId: job.id,
      jobName
    });

    return job;
  }

  async getQueue(name: string): Promise<Queue | undefined> {
    return this.queues.get(name);
  }

  async getJobCounts(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    return await queue.getJobCounts();
  }

  async getJobs(queueName: string, status: string, start = 0, end = 10) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    // @ts-ignore - BullMQ types
    return await queue.getJobs([status], start, end);
  }

  async pauseQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.pause();
    logger.info(`Queue paused: ${queueName}`);
  }

  async resumeQueue(queueName: string) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.resume();
    logger.info(`Queue resumed: ${queueName}`);
  }

  async cleanQueue(queueName: string, grace: number = 0, limit: number = 1000) {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue not found: ${queueName}`);
    }

    await queue.clean(grace, limit, 'completed');
    await queue.clean(grace, limit, 'failed');
    logger.info(`Queue cleaned: ${queueName}`);
  }

  async closeAll() {
    logger.info('Closing all queues and workers...');

    // Close all workers
    for (const [name, worker] of this.workers) {
      await worker.close();
      logger.info(`Worker closed: ${name}`);
    }

    // Close all queue events
    for (const [name, events] of this.events) {
      await events.close();
      logger.info(`Queue events closed: ${name}`);
    }

    // Close all queues
    for (const [name, queue] of this.queues) {
      await queue.close();
      logger.info(`Queue closed: ${name}`);
    }

    // Close Redis connection
    await this.connection.quit();
    logger.info('Redis connection closed');
  }

  async getQueueStats() {
    const stats: any = {};

    for (const [name, queue] of this.queues) {
      const counts = await queue.getJobCounts();
      stats[name] = {
        ...counts,
        isPaused: await queue.isPaused()
      };
    }

    return stats;
  }
}

// Singleton instance
let queueManagerInstance: QueueManager | null = null;

export function getQueueManager(): QueueManager {
  if (!queueManagerInstance) {
    queueManagerInstance = new QueueManager();
  }
  return queueManagerInstance;
}