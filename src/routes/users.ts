import { Router } from 'express';
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  approveStudent,
  rejectStudent,
  getPendingStudents,
  createUserValidation,
  updateUserValidation
} from '@/controllers/userController';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get all users (admin and super admin only)
router.get('/', authorize('admin', 'superadmin'), getUsers);

// Get pending students (admin and super admin only)
router.get('/pending', authorize('admin', 'superadmin'), getPendingStudents);

// Get user by ID (admin and super admin only)
router.get('/:id', authorize('admin', 'superadmin'), getUserById);

// Create new user (super admin only)
router.post('/', authorize('superadmin'), createUserValidation, createUser);

// Update user (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), updateUserValidation, updateUser);

// Delete user (super admin only)
router.delete('/:id', authorize('superadmin'), deleteUser);

// Approve student (admin and super admin only)
router.patch('/:id/approve', authorize('admin', 'superadmin'), approveStudent);

// Reject student (admin and super admin only)
router.patch('/:id/reject', authorize('admin', 'superadmin'), rejectStudent);

export default router;
