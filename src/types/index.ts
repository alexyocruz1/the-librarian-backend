// User Types
export type UserRole = "superadmin" | "admin" | "student" | "guest";
export type UserStatus = "pending" | "active" | "rejected" | "suspended";

export interface IUser {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  libraries?: string[]; // Library IDs for admins
  studentId?: string;
  profile?: {
    phone?: string;
  };
  preferences?: {
    language?: string;
    timezone?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      borrowReminders?: boolean;
      systemUpdates?: boolean;
    };
  };
  lastLoginAt?: Date;
  previousLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Library Types
export interface ILibrary {
  _id: string;
  code: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
  };
  contact?: {
    email?: string;
    phone?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Title Types
export interface ITitle {
  _id: string;
  isbn13?: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string[];
  categories?: string[];
  language?: string;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  coverUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Inventory Types
export interface IInventory {
  _id: string;
  libraryId: string;
  titleId: string;
  totalCopies: number;
  availableCopies: number;
  shelfLocation?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Copy Types
export type CopyStatus = "available" | "borrowed" | "reserved" | "lost" | "maintenance";
export type CopyCondition = "new" | "good" | "used" | "worn" | "damaged";

export interface ICopy {
  _id: string;
  inventoryId: string;
  libraryId: string;
  titleId: string;
  barcode?: string;
  status: CopyStatus;
  condition: CopyCondition;
  acquiredAt?: Date;
  shelfLocation?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Borrow Request Types
export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export interface IBorrowRequest {
  _id: string;
  userId: string;
  libraryId: string;
  titleId: string;
  inventoryId?: string;
  copyId?: string;
  status: RequestStatus;
  requestedAt: Date;
  decidedAt?: Date;
  decidedBy?: string;
  notes?: string;
}

// Borrow Record Types
export type LoanStatus = "borrowed" | "returned" | "overdue" | "lost";

export interface IBorrowRecord {
  _id: string;
  userId: string;
  libraryId: string;
  titleId: string;
  inventoryId: string;
  copyId: string;
  borrowDate: Date;
  dueDate: Date;
  returnDate?: Date;
  status: LoanStatus;
  approvedBy: string;
  fees?: {
    lateFee?: number;
    damageFee?: number;
    currency?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Audit Log Types
export interface IAuditLog {
  _id: string;
  actorId: string;
  action: string;
  entity: { type: string; id: string };
  changes?: Record<string, any>;
  createdAt: Date;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// JWT Payload Types
export interface JWTPayload {
  userId: string;
  email: string;
  role: UserRole;
  libraries?: string[];
}

// CSV Import Types
export interface CSVBookData {
  // Book Information
  isbn13?: string;
  isbn10?: string;
  title: string;
  subtitle?: string;
  authors: string;
  categories?: string;
  language?: string;
  publisher?: string;
  publishedYear?: number;
  description?: string;
  coverUrl?: string;
  
  // Library Information
  libraryName?: string;
  libraryCode?: string;
  
  // Individual Copy Information
  copyId?: string;
  barcode?: string;
  status?: string;
  condition?: string;
  shelfLocation?: string;
  acquiredAt?: string;
  
  // Legacy fields for backward compatibility
  totalCopies: number;
  notes?: string;
}
