import { z } from 'zod';

export const OutreachEmailInputSchema = z.object({
  recipient: z.object({
    name: z.string(),
    role: z.string(),
    email: z.string().email().nullable()
  }),
  company: z.object({
    companyName: z.string(),
    industry: z.string(),
    description: z.string(),
    techStack: z.array(z.string()),
    founders: z.array(z.object({
      name: z.string(),
      role: z.string()
    })),
    recentNews: z.array(z.string()),
    culture: z.array(z.string())
  }),
  job: z.object({
    title: z.string(),
    requirements: z.array(z.string()),
    location: z.string(),
    metadata: z.object({
      remote: z.boolean()
    }).optional()
  }),
  userProfile: z.object({
    name: z.string(),
    currentStatus: z.string(),
    topSkills: z.array(z.string()),
    portfolioUrl: z.string().url().optional(),
    githubUrl: z.string().url().optional(),
    topProject: z.object({
      name: z.string(),
      description: z.string(),
      techStack: z.array(z.string()),
      url: z.string().url().optional()
    }).optional()
  })
});

export const OutreachEmailOutputSchema = z.object({
  subject: z.string().max(60),
  body: z.string(),
  tone: z.enum(['professional', 'casual', 'friendly']),
  personalizationElements: z.array(z.string()),
  estimatedReadTime: z.string()
});

export type OutreachEmailInput = z.infer<typeof OutreachEmailInputSchema>;
export type OutreachEmailOutput = z.infer<typeof OutreachEmailOutputSchema>;