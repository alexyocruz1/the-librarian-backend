import { Router } from 'express';
import {
  getTitles,
  getTitleById,
  createTitle,
  updateTitle,
  deleteTitle,
  searchTitles,
  getTitleByISBN,
  createTitleValidation,
  updateTitleValidation
} from '@/controllers/titleController';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();

// Public routes (for book browsing)
router.get('/', getTitles);
router.get('/search', searchTitles);
router.get('/isbn/:isbn', getTitleByISBN);
router.get('/:id', getTitleById);

// Protected routes (admin and super admin only)
router.use(authenticate);

// Create title (admin and super admin only)
router.post('/', authorize('admin', 'superadmin'), createTitleValidation, createTitle);

// Update title (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), updateTitleValidation, updateTitle);

// Delete title (super admin only)
router.delete('/:id', authorize('superadmin'), deleteTitle);

export default router;
