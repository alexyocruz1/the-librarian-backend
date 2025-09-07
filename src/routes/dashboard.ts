import { Router } from 'express';
import { getDashboardStats, getRecentActivity } from '@/controllers/dashboardController';
import { authenticate, authorize } from '@/middleware/auth';

const router = Router();

// All dashboard routes require authentication
router.use(authenticate);

// Get dashboard statistics
router.get('/stats', getDashboardStats);

// Get recent activity
router.get('/activity', getRecentActivity);

export default router;
