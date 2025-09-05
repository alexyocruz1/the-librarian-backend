import { Request, Response } from 'express';
import { body, validationResult, query } from 'express-validator';
import { User } from '@/models/User';
import { UserRole, UserStatus } from '@/types';

// Validation rules
export const createUserValidation = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('role')
    .isIn(['admin', 'student', 'guest'])
    .withMessage('Role must be admin, student, or guest'),
  body('libraries')
    .optional()
    .isArray()
    .withMessage('Libraries must be an array'),
  body('studentId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Student ID cannot exceed 50 characters')
];

export const updateUserValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('role')
    .optional()
    .isIn(['admin', 'student', 'guest'])
    .withMessage('Role must be admin, student, or guest'),
  body('status')
    .optional()
    .isIn(['pending', 'active', 'rejected', 'suspended'])
    .withMessage('Status must be pending, active, rejected, or suspended'),
  body('libraries')
    .optional()
    .isArray()
    .withMessage('Libraries must be an array'),
  body('studentId')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Student ID cannot exceed 50 characters')
];

// Get all users (with pagination and filtering)
export const getUsers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const role = req.query.role as UserRole;
    const status = req.query.status as UserStatus;
    const search = req.query.search as string;

    // Build query
    const query: any = {};
    
    // Super admin can see all users, admins can only see users in their libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      // For now, admins can see all users (can be restricted later based on business logic)
    }

    if (role) query.role = role;
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query)
        .populate('libraries', 'name code')
        .select('-passwordHash')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { users },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get users'
    });
  }
};

// Get user by ID
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id)
      .populate('libraries', 'name code')
      .select('-passwordHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      data: { user }
    });

  } catch (error) {
    console.error('Get user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
};

// Create new user
export const createUser = async (req: Request, res: Response) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { name, email, password, role, libraries, studentId } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email,
      passwordHash: password, // Will be hashed by pre-save middleware
      role: role as UserRole,
      status: role === 'admin' ? 'active' : (role === 'guest' ? 'active' : 'pending'),
      libraries,
      studentId
    });

    await user.save();

    // Populate libraries for response
    await user.populate('libraries', 'name code');

    return res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Create user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
};

// Update user
export const updateUser = async (req: Request, res: Response) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const allowedUpdates = ['name', 'email', 'role', 'status', 'libraries', 'studentId', 'profile'];
    
    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Prevent super admin from being modified
    const existingUser = await User.findById(id);
    if (existingUser?.role === 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot modify super admin user'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    )
    .populate('libraries', 'name code')
    .select('-passwordHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      message: 'User updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
};

// Delete user
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent deleting super admin
    const user = await User.findById(id);
    if (user?.role === 'superadmin') {
      return res.status(403).json({
        success: false,
        error: 'Cannot delete super admin user'
      });
    }

    const deletedUser = await User.findByIdAndDelete(id);
    if (!deletedUser) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
};

// Approve student registration
export const approveStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'User is not a student'
      });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'User is not pending approval'
      });
    }

    user.status = 'active';
    await user.save();

    return res.json({
      success: true,
      message: 'Student approved successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Approve student error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to approve student'
    });
  }
};

// Reject student registration
export const rejectStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'student') {
      return res.status(400).json({
        success: false,
        error: 'User is not a student'
      });
    }

    if (user.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'User is not pending approval'
      });
    }

    user.status = 'rejected';
    await user.save();

    return res.json({
      success: true,
      message: 'Student rejected successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Reject student error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to reject student'
    });
  }
};

// Get pending students
export const getPendingStudents = async (req: Request, res: Response) => {
  try {
    const students = await User.find({ 
      role: 'student', 
      status: 'pending' 
    })
    .select('-passwordHash')
    .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: { students }
    });

  } catch (error) {
    console.error('Get pending students error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get pending students'
    });
  }
};
