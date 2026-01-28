import { z } from 'zod';

export const ApplicationWriterInputSchema = z.object({
  job: z.object({
    title: z.string(),
    company: z.string(),
    location: z.string(),
    description: z.string(),
    requirements: z.array(z.string()),
    metadata: z.object({
      remote: z.boolean(),
      salary: z.object({
        min: z.number(),
        max: z.number(),
        currency: z.string()
      }).optional()
    }).optional()
  }),
  company: z.object({
    companyName: z.string(),
    industry: z.string(),
    size: z.string(),
    description: z.string(),
    techStack: z.array(z.string()),
    founders: z.array(z.object({
      name: z.string(),
      role: z.string()
    })),
    culture: z.array(z.string()),
    recentNews: z.array(z.string())
  }),
  userProfile: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string(),
    resume: z.string(),
    projects: z.array(z.object({
      name: z.string(),
      description: z.string(),
      techStack: z.array(z.string()),
      url: z.string().url().optional()
    })),
    skills: z.array(z.string()),
    education: z.string(),
    experience: z.number(),
    achievements: z.array(z.string()),
    portfolioUrl: z.string().url().optional(),
    githubUrl: z.string().url().optional()
  }),
  applicationQuestions: z.array(z.object({
    question: z.string(),
    maxLength: z.number().optional()
  })).optional()
});

export const ApplicationWriterOutputSchema = z.object({
  coverLetter: z.object({
    subject: z.string(),
    body: z.string(),
    tone: z.enum(['formal', 'casual', 'enthusiastic'])
  }),
  formAnswers: z.array(z.object({
    question: z.string(),
    answer: z.string()
  })),
  highlights: z.array(z.string()),
  customizations: z.array(z.string())
});

export type ApplicationWriterInput = z.infer<typeof ApplicationWriterInputSchema>;
export type ApplicationWriterOutput = z.infer<typeof ApplicationWriterOutputSchema>;