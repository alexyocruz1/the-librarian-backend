import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
  libraries?: string[];
}

export const initializeSocketIO = (server: HTTPServer) => {
  const io = new SocketIOServer(server, {
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware
  io.use(async (socket: AuthenticatedSocket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      // Verify user still exists and is active
      const user = await User.findById(decoded.userId);
      if (!user || user.status !== 'active') {
        return next(new Error('Authentication error: User not found or inactive'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.libraries = user.libraries;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`User ${socket.userId} connected via WebSocket`);

    // Join user-specific room
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    // Join library-specific rooms based on user's access
    if (socket.libraries && socket.libraries.length > 0) {
      socket.libraries.forEach(libraryId => {
        socket.join(`library:${libraryId}`);
      });
    }

    // Join role-specific room
    if (socket.userRole) {
      socket.join(`role:${socket.userRole}`);
    }

    // Handle user joining a specific library room
    socket.on('join_library', (libraryId: string) => {
      if (socket.userRole === 'superadmin' || 
          (socket.libraries && socket.libraries.includes(libraryId))) {
        socket.join(`library:${libraryId}`);
        console.log(`User ${socket.userId} joined library room: ${libraryId}`);
      } else {
        socket.emit('error', { message: 'Unauthorized to join this library room' });
      }
    });

    // Handle user leaving a library room
    socket.on('leave_library', (libraryId: string) => {
      socket.leave(`library:${libraryId}`);
      console.log(`User ${socket.userId} left library room: ${libraryId}`);
    });

    // Handle typing indicators for real-time collaboration
    socket.on('typing_start', (data: { room: string; type: string }) => {
      socket.to(data.room).emit('user_typing', {
        userId: socket.userId,
        type: data.type,
        timestamp: new Date().toISOString(),
      });
    });

    socket.on('typing_stop', (data: { room: string; type: string }) => {
      socket.to(data.room).emit('user_stopped_typing', {
        userId: socket.userId,
        type: data.type,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle real-time search collaboration
    socket.on('search_start', (data: { query: string; filters: any }) => {
      socket.to(`library:${data.filters.libraryId || 'all'}`).emit('user_searching', {
        userId: socket.userId,
        query: data.query,
        filters: data.filters,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle book availability updates
    socket.on('book_availability_check', (data: { titleId: string; libraryId: string }) => {
      // This could trigger real-time availability updates
      socket.to(`library:${data.libraryId}`).emit('availability_checked', {
        titleId: data.titleId,
        libraryId: data.libraryId,
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle admin notifications
    socket.on('admin_notification', (data: { type: string; message: string; targetUsers?: string[] }) => {
      if (socket.userRole === 'admin' || socket.userRole === 'superadmin') {
        if (data.targetUsers && data.targetUsers.length > 0) {
          // Send to specific users
          data.targetUsers.forEach(userId => {
            io.to(`user:${userId}`).emit('admin_notification', {
              type: data.type,
              message: data.message,
              from: socket.userId,
              timestamp: new Date().toISOString(),
            });
          });
        } else {
          // Send to all users in the admin's libraries
          if (socket.libraries) {
            socket.libraries.forEach(libraryId => {
              io.to(`library:${libraryId}`).emit('admin_notification', {
                type: data.type,
                message: data.message,
                from: socket.userId,
                timestamp: new Date().toISOString(),
              });
            });
          }
        }
      } else {
        socket.emit('error', { message: 'Unauthorized to send admin notifications' });
      }
    });

    // Handle system status updates
    socket.on('system_status_request', () => {
      if (socket.userRole === 'admin' || socket.userRole === 'superadmin') {
        // Send system status information
        socket.emit('system_status', {
          timestamp: new Date().toISOString(),
          status: 'operational',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
        });
      }
    });

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`User ${socket.userId} disconnected: ${reason}`);
      
      // Notify other users in the same rooms that this user went offline
      socket.to(`role:${socket.userRole}`).emit('user_offline', {
        userId: socket.userId,
        timestamp: new Date().toISOString(),
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${socket.userId}:`, error);
    });
  });

  // Set up periodic tasks
  setInterval(() => {
    // Send heartbeat to all connected clients
    io.emit('heartbeat', {
      timestamp: new Date().toISOString(),
      connectedUsers: io.engine.clientsCount,
    });
  }, 30000); // Every 30 seconds

  return io;
};

// Helper function to emit to specific user
export const emitToUser = (io: SocketIOServer, userId: string, event: string, data: any) => {
  io.to(`user:${userId}`).emit(event, data);
};

// Helper function to emit to all users in a library
export const emitToLibrary = (io: SocketIOServer, libraryId: string, event: string, data: any) => {
  io.to(`library:${libraryId}`).emit(event, data);
};

// Helper function to emit to all users with a specific role
export const emitToRole = (io: SocketIOServer, role: string, event: string, data: any) => {
  io.to(`role:${role}`).emit(event, data);
};

// Helper function to emit to all connected users
export const emitToAll = (io: SocketIOServer, event: string, data: any) => {
  io.emit(event, data);
};
