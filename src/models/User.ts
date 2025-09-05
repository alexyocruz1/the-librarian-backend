import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser, UserRole, UserStatus } from '@/types';

export interface IUserDocument extends IUser, Document {
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUserDocument>({
  name: {
    type: String,
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [100, 'Name cannot exceed 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  passwordHash: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  role: {
    type: String,
    enum: ['superadmin', 'admin', 'student', 'guest'],
    default: 'guest'
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'rejected', 'suspended'],
    default: function() {
      // Guests are active by default, students are pending
      return this.role === 'guest' ? 'active' : 'pending';
    }
  },
  libraries: [{
    type: Schema.Types.ObjectId,
    ref: 'Library'
  }],
  studentId: {
    type: String,
    sparse: true // Allows multiple null values
  },
  profile: {
    phone: {
      type: String,
      match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
    }
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      delete ret.passwordHash;
      return ret;
    }
  }
});

// Indexes
UserSchema.index({ email: 1 }, { unique: true });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ libraries: 1 });

// Pre-save middleware to hash password
UserSchema.pre('save', async function(next) {
  if (!this.isModified('passwordHash')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.passwordHash = await bcrypt.hash(this.passwordHash, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Method to compare password
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.passwordHash);
};

// Static method to find user by email
UserSchema.statics.findByEmail = function(email: string) {
  return this.findOne({ email: email.toLowerCase() });
};

// Virtual for user's full name (if needed for display)
UserSchema.virtual('displayName').get(function() {
  return this.name;
});

export const User = mongoose.model<IUserDocument>('User', UserSchema);
