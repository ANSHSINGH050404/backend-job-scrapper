import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger } from '../../utils/logger';
import { OutreachEmailInput, OutreachEmailOutput } from './schemas';
import { OUTREACH_PROMPT } from './prompts';

export class OutreachEmailAgent {
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

  async execute(input: OutreachEmailInput): Promise<OutreachEmailOutput> {
    try {
      logger.info('OutreachEmailAgent: Creating outreach email', {
        recipient: input.recipient.name,
        company: input.company.companyName
      });

      // Validate recipient has contact method
      if (!input.recipient.email) {
        throw new Error('No email address available for recipient');
      }

      const prompt = this.buildPrompt(input);

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,  // Higher creativity for personalization
          maxOutputTokens: 1024,
        }
      });

      const response = result.response.text();
      const emailData = this.parseResponse(response);

      // Validate email quality
      const validation = this.validateEmail(emailData);
      if (!validation.isValid) {
        logger.warn('Email quality issues detected', {
          issues: validation.issues
        });
      }

      logger.info('OutreachEmailAgent: Email created', {
        recipient: input.recipient.name,
        wordCount: emailData.body.split(/\s+/).length
      });

      return emailData;

    } catch (error) {
      logger.error('OutreachEmailAgent: Execution failed', error);
      throw error;
    }
  }

  private buildPrompt(input: OutreachEmailInput): string {
    const { recipient, company, job, userProfile } = input;

    return `
${OUTREACH_PROMPT}

RECIPIENT:
Name: ${recipient.name}
Role: ${recipient.role}
Email: ${recipient.email}

COMPANY:
Name: ${company.companyName}
Industry: ${company.industry}
Description: ${company.description}
Tech Stack: ${company.techStack.join(', ')}
Recent News: ${company.recentNews.join(', ') || 'None available'}
Culture: ${company.culture.join(', ') || 'Not specified'}
Founders: ${company.founders.map(f => `${f.name} (${f.role})`).join(', ')}

JOB:
Title: ${job.title}
Requirements: ${job.requirements.slice(0, 5).join(', ')}
Location: ${job.location}
Remote: ${job.metadata?.remote ? 'Yes' : 'No'}

USER PROFILE:
Name: ${userProfile.name}
Current Status: ${userProfile.currentStatus}
Top Skills: ${userProfile.topSkills.join(', ')}
Portfolio: ${userProfile.portfolioUrl || 'Not provided'}
GitHub: ${userProfile.githubUrl || 'Not provided'}

Best Project (for reference):
${userProfile.topProject ? `${userProfile.topProject.name}: ${userProfile.topProject.description} (${userProfile.topProject.techStack.join(', ')})` : 'Not provided'}

TASK:
Write a short, personalized email to ${recipient.name} (${recipient.role}) about the ${job.title} position.

CALIBRATE TONE:
${recipient.role.toLowerCase().includes('founder') || recipient.role.toLowerCase().includes('ceo') 
  ? '- Use casual, friendly tone\n- Show you understand the product\n- Technical but accessible'
  : recipient.role.toLowerCase().includes('cto')
  ? '- Use technical tone\n- Emphasize technical skills\n- Reference tech stack'
  : '- Use professional tone\n- Clear about experience level\n- Straightforward'
}

OUTPUT FORMAT (JSON):
{
  "subject": "Subject line (under 50 chars)",
  "body": "Email body (100-150 words)",
  "tone": "professional" | "casual" | "friendly",
  "personalizationElements": ["Element 1", "Element 2"],
  "estimatedReadTime": "30 seconds"
}

Begin writing now. Return ONLY valid JSON.
    `.trim();
  }

  private parseResponse(response: string): OutreachEmailOutput {
    try {
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      return JSON.parse(cleanedResponse);

    } catch (error) {
      logger.error('Failed to parse OutreachEmail response', { error, response });
      throw new Error('Invalid response from AI model');
    }
  }

  validateEmail(email: OutreachEmailOutput): {
    isValid: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const wordCount = email.body.split(/\s+/).length;

    // Length validation
    if (wordCount < 80) {
      issues.push('Email too short (< 80 words)');
    }
    if (wordCount > 170) {
      issues.push('Email too long (> 170 words)');
    }

    // Subject line validation
    if (email.subject.length > 60) {
      issues.push('Subject line too long (> 60 chars)');
    }
    if (email.subject.length < 10) {
      issues.push('Subject line too short (< 10 chars)');
    }

    // Red flag patterns
    const redFlags = [
      'I am reaching out to express',
      'I came across your profile',
      'I have attached my resume',
      'looking forward to hearing from you',
      'please find attached',
      'at your earliest convenience'
    ];

    const bodyLower = email.body.toLowerCase();
    redFlags.forEach(flag => {
      if (bodyLower.includes(flag.toLowerCase())) {
        issues.push(`Contains red flag phrase: "${flag}"`);
      }
    });

    // Check for placeholder text
    if (email.body.includes('[') || email.body.includes(']')) {
      issues.push('Contains placeholder text');
    }

    // Check for personalization
    if (email.personalizationElements.length === 0) {
      issues.push('No personalization elements identified');
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }

  // Calculate estimated read time
  calculateReadTime(text: string): string {
    const wordCount = text.split(/\s+/).length;
    const wordsPerMinute = 200;
    const minutes = wordCount / wordsPerMinute;
    
    if (minutes < 1) {
      return `${Math.ceil(minutes * 60)} seconds`;
    }
    return `${Math.ceil(minutes)} ${minutes > 1 ? 'minutes' : 'minute'}`;
  }

  // Batch processing with rate limiting awareness
  async executeBatch(
    inputs: OutreachEmailInput[],
    dailyLimit: number = 5
  ): Promise<OutreachEmailOutput[]> {
    if (inputs.length > dailyLimit) {
      throw new Error(`Batch size (${inputs.length}) exceeds daily limit (${dailyLimit})`);
    }

    const results: OutreachEmailOutput[] = [];

    for (const input of inputs) {
      try {
        const result = await this.execute(input);
        results.push(result);
        
        // Rate limiting between emails
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error('Batch email creation error', {
          recipient: input.recipient.name,
          error
        });
        throw error;
      }
    }

    return results;
  }
}