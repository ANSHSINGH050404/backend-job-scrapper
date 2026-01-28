// Job Schema
interface Job {
    _id: ObjectId;
    userId: ObjectId;
    title: string;
    company: string;
    location: string;
    url: string;
    source: string;
    description: string;
    requirements: string[];
    postedDate: Date;
    discoveredAt: Date;
    score?: number;
    scoringReason?: string;
    status: "discovered" | "scored" | "rejected" | "applied";
    metadata: {
      salary?: { min: number; max: number; currency: string };
      remote: boolean;
      experienceLevel: string;
    };
    companyIntel?: ObjectId;     // Reference to Company
    createdAt: Date;
    updatedAt: Date;
  }