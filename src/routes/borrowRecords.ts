import { Router } from 'express';
import {
  getBorrowRecords,
  getBorrowRecordById,
  updateBorrowRecord,
  getActiveLoans,
  getOverdueRecords,
  getUserHistory,
  returnBook,
  updateBorrowRecordValidation
} from '@/controllers/borrowRecordController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get borrow records (admin, super admin, students, guests)
router.get('/', getBorrowRecords);

// Get active loans
router.get('/active', getActiveLoans);

// Get overdue records (admin and super admin only)
router.get('/overdue', authorize('admin', 'superadmin'), getOverdueRecords);

// Get user history
router.get('/user/:userId', getUserHistory);

// Get borrow record by ID
router.get('/:id', getBorrowRecordById);

// Update borrow record (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), authorizeLibraryAccess, updateBorrowRecordValidation, updateBorrowRecord);

// Return book (admin and super admin only)
router.patch('/:id/return', authorize('admin', 'superadmin'), authorizeLibraryAccess, returnBook);

export default router;
