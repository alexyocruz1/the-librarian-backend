import mongoose, { Schema, Document } from 'mongoose';
import { IBorrowRecord, LoanStatus } from '@/types';

export interface IBorrowRecordDocument extends Omit<IBorrowRecord, '_id'>, Document {}

export interface IBorrowRecordModel extends mongoose.Model<IBorrowRecordDocument> {
  findActive(userId?: string, libraryId?: string): Promise<IBorrowRecordDocument[]>;
  findOverdue(libraryId?: string): Promise<IBorrowRecordDocument[]>;
  findByUser(userId: string, limit?: number): Promise<IBorrowRecordDocument[]>;
}

const BorrowRecordSchema = new Schema({
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
    ref: 'Inventory',
    required: [true, 'Inventory ID is required']
  },
  copyId: {
    type: Schema.Types.ObjectId,
    ref: 'Copy',
    required: [true, 'Copy ID is required']
  },
  borrowDate: {
    type: Date,
    required: [true, 'Borrow date is required'],
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: [true, 'Due date is required']
  },
  returnDate: {
    type: Date
  },
  status: {
    type: String,
    enum: ['borrowed', 'returned', 'overdue', 'lost'],
    default: 'borrowed'
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Approved by is required']
  },
  fees: {
    lateFee: {
      type: Number,
      min: [0, 'Late fee cannot be negative'],
      default: 0
    },
    damageFee: {
      type: Number,
      min: [0, 'Damage fee cannot be negative'],
      default: 0
    },
    currency: {
      type: String,
      default: 'USD',
      maxlength: [3, 'Currency code cannot exceed 3 characters']
    }
  }
}, {
  timestamps: true
});

// Indexes
BorrowRecordSchema.index({ copyId: 1, status: 1 });
BorrowRecordSchema.index({ userId: 1, borrowDate: -1 });
BorrowRecordSchema.index({ libraryId: 1, status: 1 });
BorrowRecordSchema.index({ dueDate: 1, status: 1 });
BorrowRecordSchema.index({ status: 1 });

// Unique constraint to prevent concurrent loans per copy
BorrowRecordSchema.index(
  { copyId: 1, status: 1 }, 
  { 
    unique: true, 
    partialFilterExpression: { status: 'borrowed' } 
  }
);

// Virtual for display status
BorrowRecordSchema.virtual('displayStatus').get(function() {
  const statusMap = {
    borrowed: 'Borrowed',
    returned: 'Returned',
    overdue: 'Overdue',
    lost: 'Lost'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for days overdue
BorrowRecordSchema.virtual('daysOverdue').get(function() {
  if (this.status !== 'overdue' && this.status !== 'borrowed') return 0;
  
  const now = new Date();
  const dueDate = new Date(this.dueDate);
  const diffMs = now.getTime() - dueDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
});

// Virtual for total fees
BorrowRecordSchema.virtual('totalFees').get(function() {
  if (!this.fees) return 0;
  return (this.fees.lateFee || 0) + (this.fees.damageFee || 0);
});

// Virtual for loan duration
BorrowRecordSchema.virtual('loanDuration').get(function() {
  const endDate = this.returnDate || new Date();
  const diffMs = endDate.getTime() - this.borrowDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
});

// Pre-save middleware to update status based on dates
BorrowRecordSchema.pre('save', function(next) {
  if (this.status === 'borrowed' && !this.returnDate) {
    const now = new Date();
    if (now > this.dueDate) {
      this.status = 'overdue';
    }
  }
  next();
});

// Post-save middleware to update copy status
BorrowRecordSchema.post('save', async function() {
  try {
    const Copy = mongoose.model('Copy');
    if (this.status === 'borrowed') {
      await Copy.findByIdAndUpdate(this.copyId, { status: 'borrowed' });
    } else if (this.status === 'returned') {
      await Copy.findByIdAndUpdate(this.copyId, { status: 'available' });
    }
  } catch (error) {
    console.error('Error updating copy status:', error);
  }
});

// Static method to find active loans
BorrowRecordSchema.statics.findActive = function(userId?: string, libraryId?: string) {
  const query: any = { status: { $in: ['borrowed', 'overdue'] } };
  if (userId) query.userId = userId;
  if (libraryId) query.libraryId = libraryId;
  
  return this.find(query)
    .populate('userId', 'name email')
    .populate('titleId', 'title authors')
    .populate('copyId', 'barcode condition')
    .populate('libraryId', 'name code')
    .sort({ borrowDate: -1 });
};

// Static method to find overdue records
BorrowRecordSchema.statics.findOverdue = function(libraryId?: string) {
  const query: any = { 
    status: { $in: ['borrowed', 'overdue'] },
    dueDate: { $lt: new Date() }
  };
  if (libraryId) query.libraryId = libraryId;
  
  return this.find(query)
    .populate('userId', 'name email')
    .populate('titleId', 'title authors')
    .populate('copyId', 'barcode')
    .populate('libraryId', 'name code')
    .sort({ dueDate: 1 });
};

// Static method to find user history
BorrowRecordSchema.statics.findByUser = function(userId: string, limit: number = 50) {
  return this.find({ userId })
    .populate('titleId', 'title authors')
    .populate('copyId', 'barcode condition')
    .populate('libraryId', 'name code')
    .sort({ borrowDate: -1 })
    .limit(limit);
};

export const BorrowRecord = mongoose.model<IBorrowRecordDocument, IBorrowRecordModel>('BorrowRecord', BorrowRecordSchema);
