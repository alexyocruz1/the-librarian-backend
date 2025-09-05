import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '@/models/User';
import { JWTPayload, UserRole } from '@/types';

// Extend Express Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!JWT_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('JWT secrets are required');
}

// Generate access token
export const generateAccessToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET as string, {
    expiresIn: process.env.JWT_EXPIRES_IN || '15m'
  } as jwt.SignOptions);
};

// Generate refresh token
export const generateRefreshToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_REFRESH_SECRET as string, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  } as jwt.SignOptions);
};

// Verify access token
export const verifyAccessToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_SECRET as string) as JWTPayload;
};

// Verify refresh token
export const verifyRefreshToken = (token: string): JWTPayload => {
  return jwt.verify(token, JWT_REFRESH_SECRET as string) as JWTPayload;
};

// Authentication middleware
export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Access token required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const payload = verifyAccessToken(token);
      req.user = payload;
      return next();
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired access token'
      });
    }
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
};

// Authorization middleware factory
export const authorize = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions'
      });
    }

    return next();
  };
};

// Library access middleware (for admins)
export const authorizeLibraryAccess = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required'
    });
  }

  // Super admin has access to all libraries
  if (req.user.role === 'superadmin') {
    return next();
  }

  // Admin needs to have access to the specific library
  if (req.user.role === 'admin') {
    const libraryId = req.params.libraryId || req.body.libraryId || req.query.libraryId;
    
    if (!libraryId) {
      return res.status(400).json({
        success: false,
        error: 'Library ID required'
      });
    }

    if (!req.user.libraries || !req.user.libraries.includes(libraryId)) {
      return res.status(403).json({
        success: false,
        error: 'Access denied to this library'
      });
    }
  }

  return next();
};

// Optional authentication middleware (doesn't fail if no token)
export const optionalAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      
      try {
        const payload = verifyAccessToken(token);
        req.user = payload;
      } catch (error) {
        // Token is invalid, but we continue without user
        req.user = undefined;
      }
    }
    
    return next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    return next();
  }
};

// Refresh token middleware
export const refreshToken = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    
    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token required'
      });
    }

    try {
      const payload = verifyRefreshToken(refreshToken);
      
      // Verify user still exists and is active
      const user = await User.findById(payload.userId);
      if (!user || user.status !== 'active') {
        return res.status(401).json({
          success: false,
          error: 'User not found or inactive'
        });
      }

      // Generate new tokens
      const newAccessToken = generateAccessToken({
        userId: (user._id as any).toString(),
        email: user.email,
        role: user.role,
        libraries: user.libraries
      });

      const newRefreshToken = generateRefreshToken({
        userId: (user._id as any).toString(),
        email: user.email,
        role: user.role,
        libraries: user.libraries
      });

      // Set new refresh token in cookie
      res.cookie('refreshToken', newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
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
            libraries: user.libraries
          }
        }
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired refresh token'
      });
    }
  } catch (error) {
    console.error('Refresh token error:', error);
    return res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
};
