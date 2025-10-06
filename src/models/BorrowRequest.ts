import mongoose, { Schema, Document } from 'mongoose';
import { IBorrowRequest, RequestStatus } from '@/types';

export interface IBorrowRequestDocument extends Omit<IBorrowRequest, '_id'>, Document {}

export interface IBorrowRequestModel extends mongoose.Model<IBorrowRequestDocument> {
  findPending(libraryId?: string): Promise<IBorrowRequestDocument[]>;
  findByUser(userId: string, status?: string): Promise<IBorrowRequestDocument[]>;
}

const BorrowRequestSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  libraryId: {
    type: Schema.Types.ObjectId,
    ref: 'Library',
    required: [true, 'Library ID is required']
  },
  titleId: {
    type: Schema.Types.ObjectId,
    ref: 'Title',
    required: [true, 'Title ID is required']
  },
  inventoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Inventory'
  },
  copyId: {
    type: Schema.Types.ObjectId,
    ref: 'Copy'
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  decidedAt: {
    type: Date
  },
  decidedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [500, 'Notes cannot exceed 500 characters']
  }
}, {
  timestamps: true
});

// Indexes
BorrowRequestSchema.index({ libraryId: 1, status: 1, requestedAt: -1 });
BorrowRequestSchema.index({ userId: 1, status: 1 });
BorrowRequestSchema.index({ titleId: 1, status: 1 });
BorrowRequestSchema.index({ requestedAt: -1 });

// Virtual for display status
BorrowRequestSchema.virtual('displayStatus').get(function() {
  const statusMap = {
    pending: 'Pending',
    approved: 'Approved',
    rejected: 'Rejected',
    cancelled: 'Cancelled'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for time since request
BorrowRequestSchema.virtual('timeSinceRequest').get(function() {
  const now = new Date();
  const diffMs = now.getTime() - this.requestedAt.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMinutes > 0) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  return 'Just now';
});

// Pre-save middleware to set decidedAt when status changes
BorrowRequestSchema.pre('save', function(next) {
  if (this.isModified('status') && this.status !== 'pending' && !this.decidedAt) {
    this.decidedAt = new Date();
  }
  next();
});

// Static method to find pending requests
BorrowRequestSchema.statics.findPending = function(libraryId?: string) {
  const query: any = { status: 'pending' };
  if (libraryId) query.libraryId = libraryId;
  return this.find(query)
    .populate('userId', 'name email')
    .populate('titleId', 'title authors')
    .populate('libraryId', 'name code')
    .sort({ requestedAt: 1 });
};

// Static method to find user requests
BorrowRequestSchema.statics.findByUser = function(userId: string, status?: RequestStatus) {
  const query: any = { userId };
  if (status) query.status = status;
  console.log('🔍 BorrowRequest.findByUser query:', query);
  return this.find(query)
    .populate('titleId', 'title authors')
    .populate('libraryId', 'name code')
    .sort({ requestedAt: -1 });
};

// Static method to find by title
BorrowRequestSchema.statics.findByTitle = function(titleId: string, libraryId?: string) {
  const query: any = { titleId };
  if (libraryId) query.libraryId = libraryId;
  return this.find(query)
    .populate('userId', 'name email')
    .populate('libraryId', 'name code')
    .sort({ requestedAt: 1 });
};

export const BorrowRequest = mongoose.model<IBorrowRequestDocument, IBorrowRequestModel>('BorrowRequest', BorrowRequestSchema);
