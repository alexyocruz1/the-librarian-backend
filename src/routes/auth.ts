import { Router } from 'express';
import {
  register,
  login,
  logout,
  getProfile,
  updateProfile,
  changePassword,
  registerValidation,
  loginValidation
} from '@/controllers/authController';
import { authenticate, refreshToken } from '@/middleware/auth';
import { body } from 'express-validator';

const router = Router();

// Public routes
router.post('/register', registerValidation, register);
router.post('/login', loginValidation, login);
router.post('/refresh', refreshToken);

// Protected routes
router.use(authenticate); // All routes below require authentication

router.post('/logout', logout);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/change-password', [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters')
], changePassword);

export default router;
