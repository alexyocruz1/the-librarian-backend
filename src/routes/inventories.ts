import { Router } from 'express';
import {
  getInventories,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
  getAvailableInventories,
  updateCopyCounts,
  createInventoryValidation,
  updateInventoryValidation
} from '@/controllers/inventoryController';
import { authenticate, authorize, authorizeLibraryAccess } from '@/middleware/auth';

const router = Router();

// Public routes (for browsing available books)
router.get('/available/:libraryId', getAvailableInventories);

// Protected routes
router.use(authenticate);

// Get inventories (admin and super admin only)
router.get('/', authorize('admin', 'superadmin'), getInventories);
router.get('/:id', authorize('admin', 'superadmin'), getInventoryById);

// Create inventory (admin and super admin only)
router.post('/', authorize('admin', 'superadmin'), authorizeLibraryAccess, createInventoryValidation, createInventory);

// Update inventory (admin and super admin only)
router.put('/:id', authorize('admin', 'superadmin'), authorizeLibraryAccess, updateInventoryValidation, updateInventory);

// Delete inventory (super admin only)
router.delete('/:id', authorize('superadmin'), deleteInventory);

// Update copy counts (admin and super admin only)
router.patch('/:id/copy-counts', authorize('admin', 'superadmin'), updateCopyCounts);

export default router;
