// User Schema
interface User {
    _id: ObjectId;
    name: string;
    email: string;
    phone: string;
    profile: {
      resume: string;
      skills: string[];
      education: string;
      experience: number;
      preferredRoles: string[];
      dealBreakers: string[];
      portfolioUrl?: string;
      githubUrl?: string;
      linkedinUrl?: string;
    };
    settings: {
      dailyJobLimit: number;      // Max jobs to discover per day
      emailLimit: number;         // Max emails per day (default: 5)
      autoApprove: boolean;       // Auto-approve applications
      notifyOnResponse: boolean;
    };
    stats: {
      jobsDiscovered: number;
      applicationsSubmitted: number;
      emailsSent: number;
      responsesReceived: number;
      interviewsScheduled: number;
    };
    createdAt: Date;
    updatedAt: Date;
  }