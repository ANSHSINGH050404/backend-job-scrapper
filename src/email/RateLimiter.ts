// import {} from "../database/models/Email.model"
// import mongoose from 'mongoose'
// // Rate Limiter
// class EmailRateLimiter {
//     private emailsSentToday: number = 0;
//     private readonly DAILY_LIMIT = 5;
    
//     async canSendEmail(): Promise<boolean> {
//       return this.emailsSentToday < this.DAILY_LIMIT;
//     }
    
//     async logEmailSent(): Promise<void> {
//       this.emailsSentToday++;
//       await this.saveToDatabase();
//     }
//   }
  
//   // Deduplication
//   async function checkIfAlreadyContacted(
//     companyId: string,
//     userId: string
//   ): Promise<boolean> {
//     const existingEmail = await Email.findOne({
//       userId,
//       'recipient.company': companyId,
//       status: { $in: ['sent', 'replied'] }
//     });
//     return !!existingEmail;
//   }