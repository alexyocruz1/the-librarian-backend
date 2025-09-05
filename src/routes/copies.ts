import { Router } from 'express';
import {
  getCopies,
  getCopyById,
  createCopy,
  updateCopy,
  deleteCopy,
  getAvailableCopies,
  getCopyByBarcode,
  generateBarcode,
  createCopyValidation,
  updateCopyValidation
} from '@/controllers/copyController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// Public routes (for browsing available copies)
router.get('/available', getAvailableCopies);
router.get('/barcode/:barcode', getCopyByBarcode);

// Protected routes
router.use(authenticate);

// Get copies (admin and super admin only)
router.get('/', authorize('admin', 'superadmin'), getCopies);
router.get('/:id', authorize('admin', 'superadmin'), getCopyById);

// Create copy (admin and super admin only)
router.post('/', authorize('admin', 'superadmin'), authorizeLibraryAccess, createCopyValidation, createCopy);

// Update copy (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), authorizeLibraryAccess, updateCopyValidation, updateCopy);

// Delete copy (super admin only)
router.delete('/:id', authorize('superadmin'), deleteCopy);

// Generate barcode (admin and super admin only)
router.post('/:id/generate-barcode', authorize('admin', 'superadmin'), generateBarcode);

export default router;
