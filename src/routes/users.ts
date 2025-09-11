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

// Get all users
// Admins cannot view admins or superadmins (filtered in controller). Route access remains for UI needs.
router.get('/', authorize('admin', 'superadmin'), getUsers);

// Get pending students: admins see only students; superadmins see students and admins
router.get('/pending', authorize('admin', 'superadmin'), getPendingStudents);

// Get user by ID: admins cannot access admins/superadmins (enforced in controller)
router.get('/:id', authorize('admin', 'superadmin'), getUserById);

// Create new user (super admin only)
router.post('/', authorize('superadmin'), createUserValidation, createUser);

// Update user: admins cannot modify admins or superadmins (enforced in controller)
router.put('/:id', authorize('admin', 'superadmin'), updateUserValidation, updateUser);

// Delete user (super admin only)
router.delete('/:id', authorize('superadmin'), deleteUser);

// Approve student: admins can approve students; only superadmin can approve admins (enforced in controller)
router.patch('/:id/approve', authorize('admin', 'superadmin'), approveStudent);

// Reject student (admin and super admin only)
router.patch('/:id/reject', authorize('admin', 'superadmin'), rejectStudent);

export default router;
