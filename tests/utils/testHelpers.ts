import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole } from '../../src/types';

export interface MockUser {
  userId: string;
  email: string;
  role: UserRole;
  libraries?: string[];
}

export const createMockRequest = (overrides: any = {}): Partial<Request> => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  user: undefined,
  ...overrides
});

export const createMockResponse = (): Partial<Response> => {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

export const createMockNext = (): NextFunction => jest.fn();

export const createAuthToken = (user: MockUser): string => {
  return jwt.sign(user, process.env.JWT_SECRET || 'test-secret', {
    expiresIn: '15m'
  });
};

export const createRefreshToken = (user: MockUser): string => {
  return jwt.sign(user, process.env.JWT_REFRESH_SECRET || 'test-refresh-secret', {
    expiresIn: '7d'
  });
};

export const mockAuthenticatedRequest = (user: MockUser, overrides: any = {}) => {
  return createMockRequest({
    user,
    headers: {
      authorization: `Bearer ${createAuthToken(user)}`,
      ...overrides.headers
    },
    ...overrides
  });
};

export const expectResponse = (res: any, status: number, data?: any) => {
  expect(res.status).toHaveBeenCalledWith(status);
  if (data) {
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining(data));
  }
};

export const expectErrorResponse = (res: any, status: number, errorMessage?: string) => {
  expect(res.status).toHaveBeenCalledWith(status);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: false,
      error: errorMessage ? expect.stringContaining(errorMessage) : expect.any(String)
    })
  );
};

export const expectSuccessResponse = (res: any, data?: any) => {
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(
    expect.objectContaining({
      success: true,
      ...(data && { data: expect.objectContaining(data) })
    })
  );
};

export const createTestData = {
  user: (overrides: any = {}) => ({
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'student',
    ...overrides
  }),
  
  library: (overrides: any = {}) => ({
    code: 'TEST-01',
    name: 'Test Library',
    location: {
      address: '123 Test St',
      city: 'Test City',
      state: 'Test State',
      country: 'Test Country'
    },
    contact: {
      email: 'test@library.com',
      phone: '123-456-7890'
    },
    ...overrides
  }),
  
  title: (overrides: any = {}) => ({
    title: 'Test Book',
    authors: ['Test Author'],
    isbn13: '9781234567890',
    categories: ['Fiction'],
    publisher: 'Test Publisher',
    publishedYear: 2023,
    ...overrides
  }),
  
  inventory: (overrides: any = {}) => ({
    libraryId: '507f1f77bcf86cd799439011',
    titleId: '507f1f77bcf86cd799439012',
    totalCopies: 5,
    availableCopies: 5,
    shelfLocation: 'A1-B2',
    notes: 'Test inventory',
    ...overrides
  }),
  
  copy: (overrides: any = {}) => ({
    inventoryId: '507f1f77bcf86cd799439013',
    libraryId: '507f1f77bcf86cd799439011',
    titleId: '507f1f77bcf86cd799439012',
    barcode: 'TEST-01-2025-0001',
    status: 'available',
    condition: 'good',
    shelfLocation: 'A1-B2',
    ...overrides
  })
};
