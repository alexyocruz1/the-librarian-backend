import { Router } from 'express';
import {
  getLibraries,
  getLibraryById,
  createLibrary,
  updateLibrary,
  deleteLibrary,
  assignAdminToLibrary,
  removeAdminFromLibrary,
  getLibraryAdmins,
  createLibraryValidation,
  updateLibraryValidation
} from '@/controllers/libraryController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// Public routes (for library selection)
router.get('/', getLibraries);
router.get('/:id', getLibraryById);

// Protected routes
router.use(authenticate);

// Get library admins (admin and super admin only)
router.get('/:id/admins', authorize('admin', 'superadmin'), getLibraryAdmins);

// Create library (super admin only)
router.post('/', authorize('superadmin'), createLibraryValidation, createLibrary);

// Update library (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), authorizeLibraryAccess, updateLibraryValidation, updateLibrary);

// Delete library (super admin only)
router.delete('/:id', authorize('superadmin'), deleteLibrary);

// Assign admin to library (super admin only)
router.post('/:libraryId/admins/:userId', authorize('superadmin'), assignAdminToLibrary);

// Remove admin from library (super admin only)
router.delete('/:libraryId/admins/:userId', authorize('superadmin'), removeAdminFromLibrary);

export default router;
