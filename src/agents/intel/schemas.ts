import { z } from 'zod';

export const CompanyIntelInputSchema = z.object({
  companyName: z.string(),
  companyUrl: z.string().url().optional(),
  jobUrl: z.string().url()
});

export const FounderSchema = z.object({
  name: z.string(),
  role: z.string(),
  linkedIn: z.string().url().optional().nullable(),
  email: z.string().email().optional().nullable()
});

export const HRContactSchema = z.object({
  name: z.string(),
  role: z.string(),
  linkedIn: z.string().url().optional().nullable()
});

export const CompanyIntelOutputSchema = z.object({
  companyName: z.string(),
  industry: z.string(),
  size: z.string(),
  description: z.string(),
  techStack: z.array(z.string()),
  founders: z.array(FounderSchema),
  hrContacts: z.array(HRContactSchema),
  funding: z.object({
    stage: z.string(),
    amount: z.string()
  }).optional().nullable(),
  culture: z.array(z.string()),
  recentNews: z.array(z.string()),
  socialMedia: z.object({
    linkedin: z.string().url().optional().nullable(),
    twitter: z.string().url().optional().nullable(),
    github: z.string().url().optional().nullable()
  }),
  cachedAt: z.date()
});

export type CompanyIntelInput = z.infer<typeof CompanyIntelInputSchema>;
export type CompanyIntelOutput = z.infer<typeof CompanyIntelOutputSchema>;
export type Founder = z.infer<typeof FounderSchema>;
export type HRContact = z.infer<typeof HRContactSchema>;