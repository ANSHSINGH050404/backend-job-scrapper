interface FormAutomationInput {
    formUrl: string;
    formType: "greenhouse" | "lever" | "workday" | "custom";
    applicationData: {
      personalInfo: {
        firstName: string;
        lastName: string;
        email: string;
        phone: string;
      };
      experience: {
        yearsOfExperience: number;
        currentlyEmployed: boolean;
      };
      education: {
        degree: string;
        university: string;
        graduationYear: number;
      };
      questions: Array<{
        question: string;
        answer: string;
      }>;
      resume: {
        filePath: string;
      };
      coverLetter?: {
        text: string;
      };
    };
    approvalToken: string;       // Required for execution
  }

  interface FormAutomationOutput {
    status: "success" | "failed" | "pending_review";
    formUrl: string;
    screenshots: string[];       // Base64 encoded
    filledFields: string[];
    errors?: string[];
    requiresManualIntervention?: {
      reason: string;
      field: string;
    }[];
    submittedAt?: Date;
  }