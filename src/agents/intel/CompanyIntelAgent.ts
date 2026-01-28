import { GoogleGenerativeAI } from '@google/generative-ai';
import { chromium, Browser, Page } from 'playwright';
import * as cheerio from 'cheerio';
import { logger } from '../../utils/logger';
import { CompanyIntelInput, CompanyIntelOutput } from './schemas';
import { INTEL_PROMPT } from './prompts';

export class CompanyIntelAgent {
  private genAI: GoogleGenerativeAI;
  private model: any;
  private browser?: Browser;
  private page?: Page;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY not found');
    }
    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
  }

  async execute(input: CompanyIntelInput): Promise<CompanyIntelOutput> {
    try {
      logger.info('CompanyIntelAgent: Starting research', {
        company: input.companyName
      });

      // Initialize browser
      await this.initBrowser();

      // Gather data from multiple sources
      const websiteData = await this.scrapeCompanyWebsite(input.companyUrl);
      const linkedInData = await this.scrapeLinkedInCompany(input.companyName);
      const techStackData = await this.detectTechStack(input.companyUrl, input.jobUrl);
      
      // Consolidate data and use AI to structure it
      const consolidatedData = {
        websiteData,
        linkedInData,
        techStackData,
        companyName: input.companyName,
        companyUrl: input.companyUrl
      };

      const analysis = await this.analyzeCompanyData(consolidatedData);

      await this.closeBrowser();

      logger.info('CompanyIntelAgent: Research completed', {
        company: input.companyName,
        foundersFound: analysis.founders.length
      });

      return analysis;

    } catch (error) {
      logger.error('CompanyIntelAgent: Execution failed', error);
      await this.closeBrowser();
      throw error;
    }
  }

  private async initBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: process.env.PLAYWRIGHT_HEADLESS === 'true',
        timeout: 30000
      });
      this.page = await this.browser.newPage();
      
      // Set user agent to avoid detection
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
    }
  }

  private async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.page = undefined;
    }
  }

  private async scrapeCompanyWebsite(url?: string): Promise<any> {
    if (!url || !this.page) return {};

    try {
      await this.page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
      await this.respectRateLimit();

      const html = await this.page.content();
      const $ = cheerio.load(html);

      // Extract company description
      const description = 
        $('meta[name="description"]').attr('content') ||
        $('meta[property="og:description"]').attr('content') ||
        $('p').first().text().trim();

      // Look for About/Team pages
      const aboutLinks = $('a').filter((i, el) => {
        const text = $(el).text().toLowerCase();
        return text.includes('about') || text.includes('team') || text.includes('company');
      }).toArray();

      let founders: any[] = [];
      let teamInfo = '';

      // Try to scrape About/Team page
      if (aboutLinks.length > 0) {
        const aboutUrl = $(aboutLinks[0]).attr('href');
        if (aboutUrl) {
          const fullAboutUrl = new URL(aboutUrl, url).href;
          try {
            await this.page.goto(fullAboutUrl, { waitUntil: 'networkidle', timeout: 10000 });
            const aboutHtml = await this.page.content();
            const $about = cheerio.load(aboutHtml);
            
            teamInfo = $about('body').text();
            
            // Extract founder/leadership info
            founders = this.extractFoundersFromText(teamInfo);
          } catch (e) {
            logger.warn('Failed to scrape about page', { url: fullAboutUrl });
          }
        }
      }

      // Look for contact email
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const emails = html.match(emailRegex) || [];
      const publicEmails = emails.filter(email => 
        email.includes('careers@') || 
        email.includes('jobs@') || 
        email.includes('hiring@') ||
        email.includes('contact@')
      );

      return {
        description: description?.substring(0, 500),
        founders,
        publicEmails: [...new Set(publicEmails)],
        teamInfo: teamInfo.substring(0, 1000)
      };

    } catch (error) {
      logger.error('Failed to scrape company website', { url, error });
      return {};
    }
  }

  private async scrapeLinkedInCompany(companyName: string): Promise<any> {
    // LinkedIn scraping requires authentication and has anti-bot measures
    // For production, use LinkedIn API or third-party services
    // For now, return placeholder that can be filled manually or via API
    
    logger.info('LinkedIn scraping skipped (requires auth)', { companyName });
    
    return {
      note: 'LinkedIn data requires manual lookup or API integration',
      suggestedSearch: `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(companyName)}`
    };
  }

  private async detectTechStack(companyUrl?: string, jobUrl?: string): Promise<string[]> {
    if (!this.page) return [];

    const techStack: Set<string> = new Set();

    try {
      // Analyze job posting for tech mentions
      if (jobUrl) {
        await this.page.goto(jobUrl, { waitUntil: 'networkidle', timeout: 10000 });
        const jobHtml = await this.page.content();
        
        // Common tech keywords
        const techKeywords = [
          'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java', 'Go', 'Rust',
          'TypeScript', 'JavaScript', 'PostgreSQL', 'MongoDB', 'Redis', 'AWS',
          'Docker', 'Kubernetes', 'GraphQL', 'REST', 'Express', 'Django', 'Flask',
          'Next.js', 'Tailwind', 'Redux', 'Git', 'CI/CD', 'Jenkins', 'GitHub Actions'
        ];

        techKeywords.forEach(tech => {
          if (jobHtml.toLowerCase().includes(tech.toLowerCase())) {
            techStack.add(tech);
          }
        });
      }

      // Check company website for tech indicators
      if (companyUrl && this.page) {
        try {
          await this.page.goto(companyUrl, { timeout: 10000 });
          const html = await this.page.content();
          
          // Look for "Built with" or "Powered by" sections
          const $ = cheerio.load(html);
          const text = $('body').text();
          
          const techKeywords = [
            'React', 'Vue', 'Angular', 'Node.js', 'Python', 'Java',
            'TypeScript', 'JavaScript', 'AWS', 'Docker', 'Kubernetes'
          ];

          techKeywords.forEach(tech => {
            if (text.includes(tech)) {
              techStack.add(tech);
            }
          });
        } catch (e) {
          logger.warn('Failed to detect tech stack from website', { companyUrl });
        }
      }

    } catch (error) {
      logger.error('Tech stack detection failed', error);
    }

    return Array.from(techStack);
  }

  private extractFoundersFromText(text: string): any[] {
    const founders: any[] = [];
    
    // Look for founder/CEO mentions with simple regex
    const founderRegex = /((?:[A-Z][a-z]+ )+[A-Z][a-z]+)[,\s]+(Founder|Co-Founder|CEO|CTO|Chief Executive Officer)/gi;
    let match;
    
    while ((match = founderRegex.exec(text)) !== null) {
      founders.push({
        name: match[1].trim(),
        role: match[2].trim()
      });
    }

    return founders.slice(0, 5); // Limit to 5 founders
  }

  private async analyzeCompanyData(data: any): Promise<CompanyIntelOutput> {
    const prompt = `
${INTEL_PROMPT}

COMPANY DATA COLLECTED:
Company Name: ${data.companyName}
Website: ${data.companyUrl || 'Not provided'}

Website Description: ${data.websiteData?.description || 'Not found'}

Founders Found: ${JSON.stringify(data.websiteData?.founders || [])}

Tech Stack Detected: ${data.techStackData?.join(', ') || 'None detected'}

Team Info: ${data.websiteData?.teamInfo?.substring(0, 500) || 'Not available'}

Public Emails: ${data.websiteData?.publicEmails?.join(', ') || 'None found'}

TASK:
Analyze this data and create a structured company intelligence report.
Fill in any gaps with reasonable inferences based on the data.
If founder information is incomplete, mark as "unknown" rather than guessing.

OUTPUT FORMAT (JSON):
{
  "companyName": "string",
  "industry": "string",
  "size": "1-10" | "11-50" | "51-200" | "201-500" | "500+",
  "description": "string",
  "techStack": ["string"],
  "founders": [
    {
      "name": "string",
      "role": "string",
      "linkedIn": "string or null",
      "email": "string or null"
    }
  ],
  "hrContacts": [],
  "funding": { "stage": "string", "amount": "string" } or null,
  "culture": ["string"],
  "recentNews": ["string"],
  "socialMedia": {
    "linkedin": "string or null",
    "twitter": "string or null",
    "github": "string or null"
  }
}

Return ONLY valid JSON.
    `.trim();

    try {
      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 2048,
        }
      });

      const response = result.response.text();
      const parsed = this.parseResponse(response);

      return {
        ...parsed,
        cachedAt: new Date()
      };

    } catch (error) {
      logger.error('Failed to analyze company data', error);
      
      // Return minimal structure
      return {
        companyName: data.companyName,
        industry: 'Unknown',
        size: 'Unknown',
        description: data.websiteData?.description || 'No description available',
        techStack: data.techStackData || [],
        founders: data.websiteData?.founders || [],
        hrContacts: [],
        culture: [],
        recentNews: [],
        socialMedia: {},
        cachedAt: new Date()
      };
    }
  }

  private parseResponse(response: string): Omit<CompanyIntelOutput, 'cachedAt'> {
    try {
      const cleanedResponse = response
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      return JSON.parse(cleanedResponse);
    } catch (error) {
      logger.error('Failed to parse CompanyIntel response', { error, response });
      throw new Error('Invalid response from AI model');
    }
  }

  private async respectRateLimit(): Promise<void> {
    const delay = parseInt(process.env.SCRAPER_RATE_LIMIT_MS || '2000');
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}