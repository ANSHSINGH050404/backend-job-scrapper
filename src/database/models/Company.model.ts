// Company Schema
interface Company {
    _id: ObjectId;
    name: string;
    url?: string;
    industry: string;
    size: string;
    description: string;
    techStack: string[];
    founders: Array<{
      name: string;
      role: string;
      linkedIn?: string;
      email?: string;
    }>;
    hrContacts: Array<{
      name: string;
      role: string;
      linkedIn?: string;
    }>;
    funding?: { stage: string; amount: string };
    socialMedia: {
      linkedin?: string;
      twitter?: string;
      github?: string;
    };
    cachedAt: Date;              // Refresh after 7 days
    createdAt: Date;
    updatedAt: Date;
  }
  