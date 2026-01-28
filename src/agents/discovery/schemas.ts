interface JobDiscoveryInput {
    searchTerms: string[];          // ["software engineer", "frontend developer"]
    locations: string[];            // ["Remote", "San Francisco"]
    jobBoards: string[];            // ["linkedin", "indeed", "angellist"]
    experienceLevel: "fresher" | "entry-level" | "0-1-years";
    maxJobs: number;                // 50
  }

  interface JobDiscoveryOutput {
    jobs: Array<{
      id: string;
      title: string;
      company: string;
      location: string;
      url: string;
      source: string;
      description: string;
      requirements: string[];
      postedDate: Date;
      salary?: {
        min: number;
        max: number;
        currency: string;
      };
      remote: boolean;
      metadata: Record<string, any>;
    }>;
    discoveredAt: Date;
    totalFound: number;
  }