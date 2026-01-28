
  
  // Job Discovery Workflow
  interface JobDiscoveryJob {
    name: "discover-jobs";
    data: {
      userId: string;
      searchCriteria: {
        terms: string[];
        locations: string[];
        boards: string[];
      };
    };
    opts: {
      repeat: { cron: "0 9 * * *" },  // Daily at 9 AM
      attempts: 3,
      backoff: { type: "exponential", delay: 60000 }
    };
  }
  
  // Workflow Chain
  // 1. JobDiscoveryQueue → discovers jobs → emits to JobScoringQueue
  // 2. JobScoringQueue → scores jobs → emits high-score jobs to CompanyIntelQueue
  // 3. CompanyIntelQueue → researches company → emits to ApplicationWriterQueue
  // 4. ApplicationWriterQueue → writes application → emits to ApprovalQueue
  // 5. ApprovalQueue → waits for human approval → emits to OutreachEmailQueue
  // 6. OutreachEmailQueue → sends email → updates MemoryAgent