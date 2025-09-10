import { Router } from 'express';
import {
  importBooks,
  exportBooks,
  getCSVTemplate,
  upload,
  importBooksValidation
} from '@/controllers/csvController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Get CSV template (admin and super admin only)
router.get('/template', authorize('admin', 'superadmin'), getCSVTemplate);

// Export books to CSV (admin and super admin only)
router.get('/export', authorize('admin', 'superadmin'), exportBooks);

// Import books from CSV (admin and super admin only)
router.post('/import', 
  authorize('admin', 'superadmin'), 
  upload.single('csvFile'), 
  importBooksValidation, 
  importBooks
);

export default router;
