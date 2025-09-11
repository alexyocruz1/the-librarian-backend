import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { User } from '@/models/User';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '@/middleware/auth';
import { UserRole } from '@/types';

// Validation rules
export const registerValidation = [
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
    .optional()
    .isIn(['student', 'guest'])
    .withMessage('Role must be either student or guest')
];

export const loginValidation = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  body('rememberMe')
    .optional()
    .isBoolean()
    .withMessage('Remember me must be a boolean value')
];

// Register new user
export const register = async (req: Request, res: Response) => {
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

    const { name, email, password, role = 'guest' } = req.body;

    // Check if user already exists (block rejected as well)
    const existingUser = await User.findOne({ email: (email as string).toLowerCase() });
    if (existingUser) {
      // If previously rejected or soft-deleted, block registration for same email
      if (existingUser.status === 'rejected' || (existingUser as any).isDeleted) {
        return res.status(403).json({
          success: false,
          error: 'Registration is blocked for this email. Please contact support.'
        });
      }
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
      status: role === 'guest' ? 'active' : 'pending'
    });

    await user.save();

    // Guests: issue tokens immediately (active). Students: no tokens until approved.
    let accessToken: string | undefined;
    if (user.status === 'active') {
      accessToken = generateAccessToken({
        userId: (user._id as any).toString(),
        email: user.email,
        role: user.role,
        libraries: user.libraries
      });

      const refreshToken = generateRefreshToken({
        userId: (user._id as any).toString(),
        email: user.email,
        role: user.role,
        libraries: user.libraries
      });

      // Set refresh token in httpOnly cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });
    }

    return res.status(201).json({
      success: true,
      message: role === 'guest'
        ? 'Account created successfully'
        : 'Account created successfully. Please wait for admin approval.',
      data: {
        ...(accessToken ? { accessToken } : {}),
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          libraries: user.libraries
        }
      }
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
};

// Login user
export const login = async (req: Request, res: Response) => {
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

    const { email, password, rememberMe = false } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: 'Invalid email or password'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Account is ${user.status}. Please contact an administrator.`
      });
    }

    // Store the previous login time before updating it
    const previousLoginAt = user.lastLoginAt;
    
    // Update last login timestamp to current time
    user.lastLoginAt = new Date();
    await user.save();

    // Generate tokens
    const accessToken = generateAccessToken({
      userId: (user._id as any).toString(),
      email: user.email,
      role: user.role,
      libraries: user.libraries
    });

    const refreshToken = generateRefreshToken({
      userId: (user._id as any).toString(),
      email: user.email,
      role: user.role,
      libraries: user.libraries
    });

    // Set refresh token in httpOnly cookie with duration based on rememberMe
    const cookieMaxAge = rememberMe 
      ? 30 * 24 * 60 * 60 * 1000 // 30 days if remember me is checked
      : 24 * 60 * 60 * 1000;     // 1 day if remember me is not checked
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: cookieMaxAge
    });

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          libraries: user.libraries,
          lastLoginAt: previousLoginAt // Send the previous login time for display
        }
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
};

// Refresh access token
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.cookies;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token not provided'
      });
    }

    // Verify refresh token
    const payload = verifyRefreshToken(refreshToken);
    
    // Find user
    const user = await User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if user is active
    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        error: `Account is ${user.status}. Please contact an administrator.`
      });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken({
      userId: (user._id as any).toString(),
      email: user.email,
      role: user.role,
      libraries: user.libraries
    });

    return res.json({
      success: true,
      data: {
        accessToken: newAccessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          libraries: user.libraries,
          lastLoginAt: user.lastLoginAt,
          previousLoginAt: user.previousLoginAt
        }
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid refresh token'
    });
  }
};

// Logout user
export const logout = async (req: Request, res: Response) => {
  try {
    // Clear refresh token cookie
    res.clearCookie('refreshToken');
    
    return res.json({
      success: true,
      message: 'Logout successful'
    });
  } catch (error) {
    console.error('Logout error:', error);
    return res.status(500).json({
      success: false,
      error: 'Logout failed'
    });
  }
};

// Get current user profile
export const getProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const user = await User.findById(req.user.userId)
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
    console.error('Get profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get profile'
    });
  }
};

// Update user profile
export const updateProfile = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { name, profile, preferences } = req.body;
    const allowedUpdates = ['name', 'profile', 'preferences'];

    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      updates,
      { new: true, runValidators: true }
    ).select('-passwordHash');

    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    return res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

// Change password
export const changePassword = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'New password must be at least 6 characters long'
      });
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isCurrentPasswordValid = await user.comparePassword(currentPassword);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.passwordHash = newPassword; // Will be hashed by pre-save middleware
    await user.save();

    return res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
};
