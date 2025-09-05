import mongoose, { Schema, Document } from 'mongoose';
import { ILibrary } from '@/types';

export interface ILibraryDocument extends Omit<ILibrary, '_id'>, Document {}

const LibrarySchema = new Schema({
  code: {
    type: String,
    required: [true, 'Library code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    maxlength: [20, 'Library code cannot exceed 20 characters'],
    match: [/^[A-Z0-9\-_]+$/, 'Library code can only contain uppercase letters, numbers, hyphens, and underscores']
  },
  name: {
    type: String,
    required: [true, 'Library name is required'],
    trim: true,
    maxlength: [100, 'Library name cannot exceed 100 characters']
  },
  location: {
    address: {
      type: String,
      trim: true,
      maxlength: [200, 'Address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [50, 'City cannot exceed 50 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [50, 'State cannot exceed 50 characters']
    },
    country: {
      type: String,
      trim: true,
      maxlength: [50, 'Country cannot exceed 50 characters']
    }
  },
  contact: {
    email: {
      type: String,
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    phone: {
      type: String,
      match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
    }
  }
}, {
  timestamps: true
});

// Indexes
LibrarySchema.index({ code: 1 }, { unique: true });
LibrarySchema.index({ name: 1 });

// Virtual for full address
LibrarySchema.virtual('fullAddress').get(function() {
  const parts = [];
  if (this.location?.address) parts.push(this.location.address);
  if (this.location?.city) parts.push(this.location.city);
  if (this.location?.state) parts.push(this.location.state);
  if (this.location?.country) parts.push(this.location.country);
  return parts.join(', ');
});

// Pre-save middleware to ensure code is uppercase
LibrarySchema.pre('save', function(next) {
  if (this.isModified('code')) {
    this.code = this.code.toUpperCase();
  }
  next();
});

export const Library = mongoose.model<ILibraryDocument>('Library', LibrarySchema);
