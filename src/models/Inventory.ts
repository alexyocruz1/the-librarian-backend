import mongoose, { Schema, Document } from 'mongoose';
import { IInventory } from '@/types';

export interface IInventoryDocument extends Omit<IInventory, '_id'>, Document {}

export interface IInventoryModel extends mongoose.Model<IInventoryDocument> {
  findAvailable(libraryId?: string): Promise<IInventoryDocument[]>;
  updateCopyCounts(inventoryId: string): Promise<IInventoryDocument | null>;
}

const InventorySchema = new Schema({
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
  totalCopies: {
    type: Number,
    required: [true, 'Total copies is required'],
    min: [0, 'Total copies cannot be negative'],
    default: 0
  },
  availableCopies: {
    type: Number,
    required: [true, 'Available copies is required'],
    min: [0, 'Available copies cannot be negative'],
    default: 0
  },
  shelfLocation: {
    type: String,
    trim: true,
    maxlength: [100, 'Shelf location cannot exceed 100 characters']
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
InventorySchema.index({ libraryId: 1, titleId: 1 }, { unique: true });
InventorySchema.index({ availableCopies: 1 });
InventorySchema.index({ libraryId: 1 });
InventorySchema.index({ titleId: 1 });

// Virtual for availability status
InventorySchema.virtual('isAvailable').get(function() {
  return this.availableCopies > 0;
});

// Virtual for availability percentage
InventorySchema.virtual('availabilityPercentage').get(function() {
  if (this.totalCopies === 0) return 0;
  return Math.round((this.availableCopies / this.totalCopies) * 100);
});

// Pre-save middleware to ensure availableCopies doesn't exceed totalCopies
InventorySchema.pre('save', function(next) {
  if (this.availableCopies > this.totalCopies) {
    this.availableCopies = this.totalCopies;
  }
  next();
});

// Static method to find available inventories
InventorySchema.statics.findAvailable = function(libraryId?: string) {
  const query: any = { availableCopies: { $gt: 0 } };
  if (libraryId) {
    query.libraryId = libraryId;
  }
  return this.find(query).populate('titleId').populate('libraryId');
};

// Static method to update copy counts
InventorySchema.statics.updateCopyCounts = async function(inventoryId: string) {
  const Copy = mongoose.model('Copy');
  const inventory = await this.findById(inventoryId);
  if (!inventory) return null;

  const totalCopies = await Copy.countDocuments({ inventoryId });
  const availableCopies = await Copy.countDocuments({ 
    inventoryId, 
    status: 'available' 
  });

  inventory.totalCopies = totalCopies;
  inventory.availableCopies = availableCopies;
  
  return inventory.save();
};

export const Inventory = mongoose.model<IInventoryDocument, IInventoryModel>('Inventory', InventorySchema);
