import mongoose, { Schema, Document } from 'mongoose';
import { ICopy, CopyStatus, CopyCondition } from '@/types';

export interface ICopyDocument extends ICopy, Document {}

const CopySchema = new Schema<ICopyDocument>({
  inventoryId: {
    type: Schema.Types.ObjectId,
    ref: 'Inventory',
    required: [true, 'Inventory ID is required']
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
  barcode: {
    type: String,
    sparse: true,
    trim: true,
    uppercase: true,
    maxlength: [50, 'Barcode cannot exceed 50 characters']
  },
  status: {
    type: String,
    enum: ['available', 'borrowed', 'reserved', 'lost', 'maintenance'],
    default: 'available'
  },
  condition: {
    type: String,
    enum: ['new', 'good', 'used', 'worn', 'damaged'],
    default: 'good'
  },
  acquiredAt: {
    type: Date,
    default: Date.now
  },
  shelfLocation: {
    type: String,
    trim: true,
    maxlength: [100, 'Shelf location cannot exceed 100 characters']
  }
}, {
  timestamps: true
});

// Indexes
CopySchema.index({ libraryId: 1, status: 1 });
CopySchema.index({ libraryId: 1, barcode: 1 }, { unique: true, sparse: true });
CopySchema.index({ inventoryId: 1 });
CopySchema.index({ titleId: 1 });
CopySchema.index({ status: 1 });

// Virtual for availability
CopySchema.virtual('isAvailable').get(function() {
  return this.status === 'available';
});

// Virtual for display status
CopySchema.virtual('displayStatus').get(function() {
  const statusMap = {
    available: 'Available',
    borrowed: 'Borrowed',
    reserved: 'Reserved',
    lost: 'Lost',
    maintenance: 'Under Maintenance'
  };
  return statusMap[this.status] || this.status;
});

// Virtual for display condition
CopySchema.virtual('displayCondition').get(function() {
  const conditionMap = {
    new: 'New',
    good: 'Good',
    used: 'Used',
    worn: 'Worn',
    damaged: 'Damaged'
  };
  return conditionMap[this.condition] || this.condition;
});

// Pre-save middleware to generate barcode if not provided
CopySchema.pre('save', async function(next) {
  if (!this.barcode && this.isNew) {
    try {
      const Library = mongoose.model('Library');
      const library = await Library.findById(this.libraryId);
      if (library) {
        const year = new Date().getFullYear();
        const count = await this.constructor.countDocuments({ 
          libraryId: this.libraryId,
          barcode: { $regex: `^${library.code}-${year}-` }
        });
        this.barcode = `${library.code}-${year}-${String(count + 1).padStart(4, '0')}`;
      }
    } catch (error) {
      next(error as Error);
    }
  }
  next();
});

// Post-save middleware to update inventory counts
CopySchema.post('save', async function() {
  try {
    const Inventory = mongoose.model('Inventory');
    await Inventory.updateCopyCounts(this.inventoryId);
  } catch (error) {
    console.error('Error updating inventory counts:', error);
  }
});

// Post-remove middleware to update inventory counts
CopySchema.post('remove', async function() {
  try {
    const Inventory = mongoose.model('Inventory');
    await Inventory.updateCopyCounts(this.inventoryId);
  } catch (error) {
    console.error('Error updating inventory counts:', error);
  }
});

// Static method to find available copies
CopySchema.statics.findAvailable = function(libraryId?: string, titleId?: string) {
  const query: any = { status: 'available' };
  if (libraryId) query.libraryId = libraryId;
  if (titleId) query.titleId = titleId;
  return this.find(query).populate('inventoryId').populate('titleId');
};

// Static method to find by barcode
CopySchema.statics.findByBarcode = function(barcode: string, libraryId?: string) {
  const query: any = { barcode: barcode.toUpperCase() };
  if (libraryId) query.libraryId = libraryId;
  return this.findOne(query).populate('inventoryId').populate('titleId');
};

export const Copy = mongoose.model<ICopyDocument>('Copy', CopySchema);
