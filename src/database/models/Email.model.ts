import mongoose, { Schema, Document } from 'mongoose';

export interface IEmail extends Document {
  userId: mongoose.Types.ObjectId;
  applicationId?: mongoose.Types.ObjectId;
  recipient: {
    name: string;
    email: string;
    role: string;
  };
  subject: string;
  body: string;
  status: 'draft' | 'pending_approval' | 'sent' | 'failed' | 'replied';
  sentAt?: Date;
  repliedAt?: Date;
  reply?: string;
  gmailMessageId?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmailSchema = new Schema<IEmail>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  applicationId: {
    type: Schema.Types.ObjectId,
    ref: 'Application'
  },
  recipient: {
    name: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true,
      lowercase: true
    },
    role: {
      type: String,
      required: true
    }
  },
  subject: {
    type: String,
    required: true
  },
  body: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['draft', 'pending_approval', 'sent', 'failed', 'replied'],
    default: 'draft',
    index: true
  },
  sentAt: {
    type: Date
  },
  repliedAt: {
    type: Date
  },
  reply: {
    type: String
  },
  gmailMessageId: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for performance
EmailSchema.index({ userId: 1, sentAt: -1 });
EmailSchema.index({ 'recipient.email': 1, userId: 1 });
EmailSchema.index({ status: 1, userId: 1 });

export const Email = mongoose.model<IEmail>('Email', EmailSchema);