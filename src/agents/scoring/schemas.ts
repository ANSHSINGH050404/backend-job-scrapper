interface JobScoringInput {
  job: JobListing;
  userProfile: {
    skills: string[];
    experience: number; // years
    education: string;
    preferredRoles: string[];
    preferredCompanies?: string[];
    dealBreakers: string[]; // ["C++", "on-site only"]
  };
}

interface JobScoringOutput {
  jobId: string;
  score: number; // 0-100
  verdict: "accept" | "reject" | "maybe";
  reasoning: string;
  matchedSkills: string[];
  missingSkills: string[];
  dealBreakerFound?: string;
  confidence: number; // 0-1
}
