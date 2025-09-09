import mongoose, { Schema, Document } from 'mongoose';
import { ITitle } from '@/types';

export interface ITitleDocument extends Omit<ITitle, '_id'>, Document {}

export interface ITitleModel extends mongoose.Model<ITitleDocument> {
  searchTitles(query: string, limit?: number): Promise<ITitleDocument[]>;
  findByISBN(isbn: string): Promise<ITitleDocument | null>;
}

const TitleSchema = new Schema({
  isbn13: {
    type: String,
    match: [/^\d{13}$/, 'ISBN13 must be exactly 13 digits']
  },
  isbn10: {
    type: String,
    match: [/^\d{10}$/, 'ISBN10 must be exactly 10 digits']
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  subtitle: {
    type: String,
    trim: true,
    maxlength: [200, 'Subtitle cannot exceed 200 characters']
  },
  authors: [{
    type: String,
    required: [true, 'At least one author is required'],
    trim: true,
    maxlength: [100, 'Author name cannot exceed 100 characters']
  }],
  categories: [{
    type: String,
    trim: true,
    maxlength: [50, 'Category cannot exceed 50 characters']
  }],
  language: {
    type: String,
    trim: true,
    maxlength: [10, 'Language code cannot exceed 10 characters'],
    default: 'en'
  },
  publisher: {
    type: String,
    trim: true,
    maxlength: [100, 'Publisher name cannot exceed 100 characters']
  },
  publishedYear: {
    type: Number,
    min: [1000, 'Published year must be a valid year'],
    max: [new Date().getFullYear() + 1, 'Published year cannot be in the future']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [2000, 'Description cannot exceed 2000 characters']
  },
  coverUrl: {
    type: String,
    trim: true,
    match: [/^https?:\/\/.+/, 'Cover URL must be a valid HTTP/HTTPS URL']
  }
}, {
  timestamps: true
});

// Indexes
TitleSchema.index({ isbn13: 1 }, { unique: true, sparse: true });
TitleSchema.index({ title: 'text', authors: 'text', categories: 'text' });
TitleSchema.index({ authors: 1 });
TitleSchema.index({ categories: 1 });
TitleSchema.index({ publishedYear: 1 });

// Virtual for display title (title + subtitle)
TitleSchema.virtual('displayTitle').get(function() {
  return this.subtitle ? `${this.title}: ${this.subtitle}` : this.title;
});

// Virtual for authors as string
TitleSchema.virtual('authorsString').get(function() {
  return this.authors.join(', ');
});

// Static method to search titles
TitleSchema.statics.searchTitles = function(query: string, limit: number = 10) {
  return this.find(
    { $text: { $search: query } },
    { score: { $meta: 'textScore' } }
  )
  .sort({ score: { $meta: 'textScore' } })
  .limit(limit);
};

// Static method to find by ISBN
TitleSchema.statics.findByISBN = function(isbn: string) {
  return this.findOne({
    $or: [
      { isbn13: isbn },
      { isbn10: isbn }
    ]
  });
};

export const Title = mongoose.model<ITitleDocument, ITitleModel>('Title', TitleSchema);
