import { Router } from 'express';
import {
  getBorrowRequests,
  getBorrowRequestById,
  createBorrowRequest,
  updateBorrowRequest,
  cancelBorrowRequest,
  getPendingRequests,
  getUserRequests,
  createBorrowRequestValidation,
  updateBorrowRequestValidation
} from '@/controllers/borrowRequestController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get borrow requests (admin, super admin, students, guests)
router.get('/', getBorrowRequests);

// Get pending requests (admin and super admin only)
router.get('/pending', authorize('admin', 'superadmin'), getPendingRequests);

// Get user requests
router.get('/user/:userId', getUserRequests);

// Get borrow request by ID
router.get('/:id', getBorrowRequestById);

// Create borrow request (students and guests only)
router.post('/', authorize('student', 'guest'), createBorrowRequestValidation, createBorrowRequest);

// Update borrow request (approve/reject - admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), authorizeLibraryAccess, updateBorrowRequestValidation, updateBorrowRequest);

// Cancel borrow request (students and guests only)
router.patch('/:id/cancel', authorize('student', 'guest'), cancelBorrowRequest);

export default router;
