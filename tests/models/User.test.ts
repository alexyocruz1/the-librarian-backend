import { User } from '../../src/models/User';
import { connectDatabase } from '../../src/config/database';

describe('User Model', () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect((savedUser as any).name).toBe(userData.name);
      expect((savedUser as any).email).toBe(userData.email);
      expect((savedUser as any).role).toBe(userData.role);
      expect((savedUser as any).status).toBe(userData.status);
      expect((savedUser as any).createdAt).toBeDefined();
      expect((savedUser as any).updatedAt).toBeDefined();
    });

    it('should require name field', async () => {
      const userData = {
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should require email field', async () => {
      const userData = {
        name: 'John Doe',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should require unique email', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active'
      };

      const user1 = new User(userData);
      await user1.save();

      const user2 = new User(userData);
      await expect(user2.save()).rejects.toThrow();
    });

    it('should validate email format', async () => {
      const userData = {
        name: 'John Doe',
        email: 'invalid-email',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should validate role enum', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'invalid-role',
        status: 'active'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should validate status enum', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'invalid-status'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'plainpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).passwordHash).not.toBe('plainpassword');
      expect((savedUser as any).passwordHash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });

    it('should compare password correctly', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'plainpassword',
        role: 'student',
        status: 'active'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      const isMatch = await savedUser.comparePassword('plainpassword');
      expect(isMatch).toBe(true);

      const isNotMatch = await savedUser.comparePassword('wrongpassword');
      expect(isNotMatch).toBe(false);
    });
  });

  describe('Default Values', () => {
    it('should set default role to guest', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).role).toBe('guest');
    });

    it('should set default status to active for guests', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'guest'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).status).toBe('active');
    });

    it('should set default status to pending for students', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).status).toBe('pending');
    });
  });

  describe('Libraries Array', () => {
    it('should handle libraries array for admins', async () => {
      const userData = {
        name: 'Admin User',
        email: 'admin@example.com',
        passwordHash: 'hashedpassword',
        role: 'admin',
        status: 'active',
        libraries: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).libraries).toHaveLength(2);
      expect((savedUser as any).libraries).toContain('507f1f77bcf86cd799439011');
      expect((savedUser as any).libraries).toContain('507f1f77bcf86cd799439012');
    });
  });

  describe('Profile Object', () => {
    it('should handle profile object with phone', async () => {
      const userData = {
        name: 'John Doe',
        email: 'john@example.com',
        passwordHash: 'hashedpassword',
        role: 'student',
        status: 'active',
        profile: {
          phone: '123-456-7890'
        }
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect((savedUser as any).profile).toBeDefined();
      expect((savedUser as any).profile?.phone).toBe('123-456-7890');
    });
  });
});
