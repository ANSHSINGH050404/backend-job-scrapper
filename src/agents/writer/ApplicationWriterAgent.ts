import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../utils/logger';
import { ApplicationWriterInput, ApplicationWriterOutput } from './schemas';
import { WRITER_PROMPT } from './prompts';

export class ApplicationWriterAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async execute(input: ApplicationWriterInput): Promise<ApplicationWriterOutput> {
    try {
      logger.info('ApplicationWriterAgent: Starting application creation', {
        job: input.job.title,
        company: input.company.companyName
      });

      const prompt = this.buildPrompt(input);

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,  // Higher for creative writing
          maxOutputTokens: 3096,
        }
      });

      const response = result.response.text();
      const applicationData = this.parseResponse(response);

      logger.info('ApplicationWriterAgent: Application created', {
        job: input.job.title,
        coverLetterLength: applicationData.coverLetter.body.length
      });

      return applicationData;

    } catch (error) {
      logger.error('ApplicationWriterAgent: Execution failed', error);
      throw error;
    }
  }

  private buildPrompt(input: ApplicationWriterInput): string {
    const { job, company, userProfile, applicationQuestions } = input;

    return `
${WRITER_PROMPT}

JOB DETAILS:
Title: ${job.title}
Company: ${company.companyName}
Description: ${job.description.substring(0, 500)}
Requirements: ${job.requirements.join(', ')}
Location: ${job.location}
Remote: ${job.metadata?.remote ? 'Yes' : 'No'}

COMPANY INTELLIGENCE:
Industry: ${company.industry}
Size: ${company.size}
Description: ${company.description}
Tech Stack: ${company.techStack.join(', ')}
Culture: ${company.culture.join(', ')}
Recent News: ${company.recentNews.join(', ') || 'None'}
Founders: ${company.founders.map(f => `${f.name} (${f.role})`).join(', ') || 'Unknown'}

USER PROFILE:
Name: ${userProfile.name}
Skills: ${userProfile.skills.join(', ')}
Education: ${userProfile.education}
Experience: ${userProfile.experience} years
Resume Summary: ${userProfile.resume.substring(0, 500)}

Projects:
${userProfile.projects.map(p => `- ${p.name}: ${p.description} (${p.techStack.join(', ')})`).join('\n')}

Achievements:
${userProfile.achievements.map(a => `- ${a}`).join('\n')}

Portfolio: ${userProfile.portfolioUrl || 'Not provided'}
GitHub: ${userProfile.githubUrl || 'Not provided'}

${applicationQuestions ? `
APPLICATION QUESTIONS:
${applicationQuestions.map((q, i) => `${i + 1}. ${q.question} ${q.maxLength ? `(Max ${q.maxLength} words)` : ''}`).join('\n')}
` : ''}

TASK:
Create a personalized cover letter and answer all application questions.

OUTPUT FORMAT (JSON):
{
  "coverLetter": {
    "subject": "Application for [Job Title] at [Company]",
    "body": "Full cover letter text (200-300 words)",
    "tone": "formal" | "casual" | "enthusiastic"
  },
  "formAnswers": [
    {
      "question": "Question text",
      "answer": "Your answer"
    }
  ],
  "highlights": ["Key point 1", "Key point 2", "Key point 3"],
  "customizations": ["Company-specific touch 1", "Company-specific touch 2"]
}

Begin writing now. Return ONLY valid JSON.
    `.trim();
  }

  private parseResponse(response: string): ApplicationWriterOutput {
    try {
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed = JSON.parse(cleanedResponse);

      // Validate cover letter length
      const wordCount = parsed.coverLetter.body.split(/\s+/).length;
      if (wordCount < 150 || wordCount > 350) {
        logger.warn('Cover letter length outside optimal range', {
          wordCount,
          optimal: '200-300'
        });
      }

      // Check for forbidden phrases
      const forbiddenPhrases = [
        'I am excited to apply',
        'I am a quick learner',
        'I believe I would be a great fit',
        'I came across this position'
      ];

      const body = parsed.coverLetter.body.toLowerCase();
      const foundForbidden = forbiddenPhrases.filter(phrase => 
        body.includes(phrase.toLowerCase())
      );

      if (foundForbidden.length > 0) {
        logger.warn('Cover letter contains forbidden phrases', {
          phrases: foundForbidden
        });
      }

      return parsed;

    } catch (error) {
      logger.error('Failed to parse ApplicationWriter response', { error, response });
      throw new Error('Invalid response from AI model');
    }
  }

  // Batch processing for multiple jobs
  async executeBatch(inputs: ApplicationWriterInput[]): Promise<ApplicationWriterOutput[]> {
    const results: ApplicationWriterOutput[] = [];

    for (const input of inputs) {
      try {
        const result = await this.execute(input);
        results.push(result);
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error('Batch application writing error', {
          job: input.job.title,
          error
        });
        throw error;
      }
    }

    return results;
  }

  // Quality check for generated content
  validateCoverLetter(coverLetter: string): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const wordCount = coverLetter.split(/\s+/).length;

    if (wordCount < 150) {
      issues.push('Cover letter too short (< 150 words)');
    }
    if (wordCount > 350) {
      issues.push('Cover letter too long (> 350 words)');
    }

    const forbiddenPhrases = [
      'I am excited to apply',
      'I am a quick learner',
      'I believe I would be a great fit'
    ];

    forbiddenPhrases.forEach(phrase => {
      if (coverLetter.toLowerCase().includes(phrase.toLowerCase())) {
        issues.push(`Contains forbidden phrase: "${phrase}"`);
      }
    });

    // Check for generic content
    if (coverLetter.includes('[Company]') || coverLetter.includes('[Job Title]')) {
      issues.push('Contains placeholder text');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}