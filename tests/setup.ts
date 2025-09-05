import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { connectDatabase } from '../src/config/database';

let mongoServer: MongoMemoryServer;

// Setup test database
beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Override the database connection for tests
  process.env.MONGODB_URI = mongoUri;
  Object.defineProperty(process.env, 'NODE_ENV', {
    value: 'test',
    configurable: true
  });
  
  await connectDatabase();
});

// Clean up after each test
afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
});

// Clean up after all tests
afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

// Global test utilities
global.testUtils = {
  createTestUser: async (userData: any = {}) => {
    const User = require('../src/models/User').default;
    const defaultUser = {
      name: 'Test User',
      email: 'test@example.com',
      passwordHash: 'hashedpassword',
      role: 'student',
      status: 'active',
      ...userData
    };
    return await User.create(defaultUser);
  },
  
  createTestLibrary: async (libraryData: any = {}) => {
    const Library = require('../src/models/Library').default;
    const defaultLibrary = {
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
      ...libraryData
    };
    return await Library.create(defaultLibrary);
  },
  
  createTestTitle: async (titleData: any = {}) => {
    const Title = require('../src/models/Title').default;
    const defaultTitle = {
      title: 'Test Book',
      authors: ['Test Author'],
      isbn13: '9781234567890',
      categories: ['Fiction'],
      publisher: 'Test Publisher',
      publishedYear: 2023,
      ...titleData
    };
    return await Title.create(defaultTitle);
  }
};
