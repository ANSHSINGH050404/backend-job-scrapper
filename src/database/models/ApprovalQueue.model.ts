import mongoose, { Schema, Document } from 'mongoose';

export interface IApprovalQueue extends Document {
  userId: mongoose.Types.ObjectId;
  type: 'email' | 'form_submission' | 'application';
  entityId: mongoose.Types.ObjectId;
  entityData: any;  // Store snapshot of data for preview
  status: 'pending' | 'approved' | 'rejected';
  requestedAt: Date;
  reviewedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApprovalQueueSchema = new Schema<IApprovalQueue>({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['email', 'form_submission', 'application'],
    required: true,
    index: true
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true,
    refPath: 'onModel'
  },
  entityData: {
    type: Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
ApprovalQueueSchema.index({ userId: 1, status: 1 });
ApprovalQueueSchema.index({ requestedAt: -1 });

export const ApprovalQueue = mongoose.model<IApprovalQueue>('ApprovalQueue', ApprovalQueueSchema);