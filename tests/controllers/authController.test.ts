import request from 'supertest';
import express from 'express';
import authRoutes from '../../src/routes/auth';
import { User } from '../../src/models/User';
import { createTestData } from '../utils/testHelpers';

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

describe('Auth Controller', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /auth/register', () => {
    it('should register a new guest user successfully', async () => {
      const userData = createTestData.user({
        role: 'guest'
      });

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(userData.email);
      expect(response.body.data.user.role).toBe('guest');
      expect(response.body.data.user.status).toBe('active');
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should register a new student user with pending status', async () => {
      const userData = createTestData.user({
        role: 'student'
      });

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.role).toBe('student');
      expect(response.body.data.user.status).toBe('pending');
    });

    it('should not allow registration with invalid role', async () => {
      const userData = createTestData.user({
        role: 'admin' // Only super admin can create admins
      });

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should not allow duplicate email registration', async () => {
      const userData = createTestData.user();

      // First registration
      await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Second registration with same email
      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User with this email already exists');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate email format', async () => {
      const userData = createTestData.user({
        email: 'invalid-email'
      });

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should validate password length', async () => {
      const userData = createTestData.user({
        password: '123' // Too short
      });

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const userData = createTestData.user();
      await request(app)
        .post('/auth/register')
        .send(userData);
    });

    it('should login with valid credentials', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe(loginData.email);
      expect(response.body.data.accessToken).toBeDefined();
    });

    it('should not login with invalid email', async () => {
      const loginData = {
        email: 'wrong@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email or password');
    });

    it('should not login with invalid password', async () => {
      const loginData = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email or password');
    });

    it('should not login with pending status', async () => {
      // Create a student user (pending status)
      const studentData = createTestData.user({
        email: 'student@example.com',
        role: 'student'
      });
      await request(app)
        .post('/auth/register')
        .send(studentData);

      const loginData = {
        email: 'student@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Account is pending');
    });

    it('should validate required fields', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/logout', () => {
    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Logout successful');
    });
  });
});
