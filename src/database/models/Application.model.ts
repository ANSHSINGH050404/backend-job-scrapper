// Application Schema
interface Application {
    _id: ObjectId;
    userId: ObjectId;
    jobId: ObjectId;
    status: "draft" | "pending_approval" | "submitted" | "rejected" | "interviewing" | "accepted";
    coverLetter: {
      subject: string;
      body: string;
    };
    formAnswers?: Array<{ question: string; answer: string }>;
    submittedAt?: Date;
    responseReceived?: Date;
    emailSent: boolean;
    emailId?: ObjectId;
    timeline: Array<{
      status: string;
      timestamp: Date;
      note?: string;
    }>;
    createdAt: Date;
    updatedAt: Date;
  }