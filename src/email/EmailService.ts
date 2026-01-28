import nodemailer from 'nodemailer';
import { google } from 'googleapis';
import { logger } from '../utils/logger';
import { Email } from '../database/models/Email.model';
import { User } from '../database/models/User.model';
import mongoose from 'mongoose';

export class EmailService {
  private transporter: any;
  private oauth2Client: any;

  constructor() {
    this.initializeGmail();
  }

  private async initializeGmail() {
    try {
      this.oauth2Client = new google.auth.OAuth2(
        process.env.GMAIL_CLIENT_ID,
        process.env.GMAIL_CLIENT_SECRET,
        process.env.GMAIL_REDIRECT_URI
      );

      this.oauth2Client.setCredentials({
        refresh_token: process.env.GMAIL_REFRESH_TOKEN
      });

      const accessToken = await this.oauth2Client.getAccessToken();

      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'OAuth2',
          user: process.env.SMTP_FROM_EMAIL,
          clientId: process.env.GMAIL_CLIENT_ID,
          clientSecret: process.env.GMAIL_CLIENT_SECRET,
          refreshToken: process.env.GMAIL_REFRESH_TOKEN,
          accessToken: accessToken.token || ''
        }
      });

      logger.info('Gmail service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Gmail service', error);
      throw error;
    }
  }

  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    userId: string;
    applicationId?: string;
    recipientName?: string;
    recipientRole?: string;
  }): Promise<{ success: boolean; messageId?: string; error?: string }> {
    try {
      // Check rate limit
      const canSend = await this.checkRateLimit(params.userId);
      if (!canSend) {
        return {
          success: false,
          error: 'Daily email limit reached (5 emails/day)'
        };
      }

      // Check for duplicate outreach
      const isDuplicate = await this.checkDuplicateOutreach(params.to, params.userId);
      if (isDuplicate) {
        return {
          success: false,
          error: 'Already sent email to this recipient'
        };
      }

      // Send email
      const info = await this.transporter.sendMail({
        from: `"${process.env.SMTP_FROM_NAME || 'Job Seeker'}" <${process.env.SMTP_FROM_EMAIL}>`,
        to: params.to,
        subject: params.subject,
        text: params.body,
        html: this.convertToHtml(params.body)
      });

      // Log email to database
      await Email.create({
        userId: new mongoose.Types.ObjectId(params.userId),
        applicationId: params.applicationId ? new mongoose.Types.ObjectId(params.applicationId) : undefined,
        recipient: {
          name: params.recipientName || params.to,
          email: params.to,
          role: params.recipientRole || 'Unknown'
        },
        subject: params.subject,
        body: params.body,
        status: 'sent',
        sentAt: new Date(),
        gmailMessageId: info.messageId
      });

      // Update user stats
      await User.findByIdAndUpdate(params.userId, {
        $inc: { 'stats.emailsSent': 1 }
      });

      logger.info('Email sent successfully', {
        to: params.to,
        subject: params.subject,
        messageId: info.messageId
      });

      return {
        success: true,
        messageId: info.messageId
      };

    } catch (error) {
      logger.error('Failed to send email', { error, params });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async checkRateLimit(userId: string): Promise<boolean> {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const dailyLimit = user.settings.emailLimit || 5;

      // Count emails sent today
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const emailsSentToday = await Email.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        sentAt: { $gte: today },
        status: 'sent'
      });

      return emailsSentToday < dailyLimit;

    } catch (error) {
      logger.error('Rate limit check failed', { error, userId });
      return false;
    }
  }

  async checkDuplicateOutreach(email: string, userId: string): Promise<boolean> {
    try {
      const existingEmail = await Email.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        'recipient.email': email,
        status: { $in: ['sent', 'replied'] }
      });

      return !!existingEmail;

    } catch (error) {
      logger.error('Duplicate check failed', { error, email, userId });
      return false;
    }
  }

  async getEmailsRemainingToday(userId: string): Promise<number> {
    try {
      const user = await User.findById(userId);
      if (!user) return 0;

      const dailyLimit = user.settings.emailLimit || 5;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const emailsSentToday = await Email.countDocuments({
        userId: new mongoose.Types.ObjectId(userId),
        sentAt: { $gte: today },
        status: 'sent'
      });

      return Math.max(0, dailyLimit - emailsSentToday);

    } catch (error) {
      logger.error('Failed to get remaining emails', { error, userId });
      return 0;
    }
  }

  async getEmailHistory(userId: string, limit: number = 50): Promise<any[]> {
    try {
      const emails = await Email.find({
        userId: new mongoose.Types.ObjectId(userId)
      })
        .sort({ sentAt: -1 })
        .limit(limit)
        .select('recipient subject status sentAt repliedAt');

      return emails;

    } catch (error) {
      logger.error('Failed to get email history', { error, userId });
      return [];
    }
  }

  async markAsReplied(emailId: string, replyText?: string): Promise<void> {
    try {
      await Email.findByIdAndUpdate(emailId, {
        status: 'replied',
        repliedAt: new Date(),
        reply: replyText
      });

      // Update user stats
      const email = await Email.findById(emailId);
      if (email) {
        await User.findByIdAndUpdate(email.userId, {
          $inc: { 'stats.responsesReceived': 1 }
        });
      }

      logger.info('Email marked as replied', { emailId });

    } catch (error) {
      logger.error('Failed to mark email as replied', { error, emailId });
      throw error;
    }
  }

  private convertToHtml(text: string): string {
    // Simple text to HTML conversion
    return text
      .split('\n\n')
      .map(para => `<p>${para.replace(/\n/g, '<br>')}</p>`)
      .join('');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.transporter.verify();
      logger.info('Email service connection verified');
      return true;
    } catch (error) {
      logger.error('Email service connection failed', error);
      return false;
    }
  }

  async sendTestEmail(to: string): Promise<boolean> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM_EMAIL,
        to,
        subject: 'Test Email - Job Agent System',
        text: 'This is a test email from the Job Agent system. If you received this, email service is working correctly.'
      });
      return true;
    } catch (error) {
      logger.error('Test email failed', error);
      return false;
    }
  }
}