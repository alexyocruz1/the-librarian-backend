import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';

import { connectDatabase } from '@/config/database';
import { initializeSocketIO } from '@/socket/socketHandler';
import { notificationService } from '@/services/notificationService';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip rate limiting for OPTIONS requests (CORS preflight)
    return req.method === 'OPTIONS';
  }
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(limiter);
app.use(morgan('combined'));
app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'https://the-librarian-frontend.vercel.app',
  FRONTEND_URL
].filter((origin, index, self) => self.indexOf(origin) === index); // Remove duplicates

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Library Management System API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Import routes
import authRoutes from '@/routes/auth';
import userRoutes from '@/routes/users';
import libraryRoutes from '@/routes/libraries';
import titleRoutes from '@/routes/titles';
import inventoryRoutes from '@/routes/inventories';
import copyRoutes from '@/routes/copies';
import borrowRequestRoutes from '@/routes/borrowRequests';
import borrowRecordRoutes from '@/routes/borrowRecords';
import csvRoutes from '@/routes/csv';
import dashboardRoutes from '@/routes/dashboard';
import reportsRoutes from '@/routes/reports';

// API routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/libraries', libraryRoutes);
app.use('/api/v1/titles', titleRoutes);
app.use('/api/v1/inventories', inventoryRoutes);
app.use('/api/v1/copies', copyRoutes);
app.use('/api/v1/borrow-requests', borrowRequestRoutes);
app.use('/api/v1/borrow-records', borrowRecordRoutes);
app.use('/api/v1/csv', csvRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/reports', reportsRoutes);

// API info endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'Library Management System API v1',
    endpoints: {
      auth: '/api/v1/auth',
      users: '/api/v1/users',
      libraries: '/api/v1/libraries',
      titles: '/api/v1/titles',
      inventories: '/api/v1/inventories',
      copies: '/api/v1/copies',
            borrowRequests: '/api/v1/borrow-requests',
            borrowRecords: '/api/v1/borrow-records',
            csv: '/api/v1/csv',
            dashboard: '/api/v1/dashboard',
            reports: '/api/v1/reports'
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Global error handler:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal server error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Start server
const startServer = async () => {
  try {
    // Connect to database
    await connectDatabase();
    
    // Initialize Socket.IO
    const io = initializeSocketIO(server);
    notificationService.setSocketIO(io);
    
    // Start listening
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📚 Library Management System API v1`);
      console.log(`🔗 Health check: http://localhost:${PORT}/health`);
      console.log(`🔌 WebSocket server initialized`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start the server
startServer();

export default app;
