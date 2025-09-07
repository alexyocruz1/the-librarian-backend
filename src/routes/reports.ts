import express from 'express';
import { authenticate, authorize } from '@/middleware/auth';
import { getReportsData, getReportData } from '@/controllers/reportsController';

const router = express.Router();

// All routes require authentication and admin/superadmin role
router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

// Get comprehensive reports data
router.get('/', getReportsData);

// Get specific report data
router.get('/:type', getReportData);

export default router;
