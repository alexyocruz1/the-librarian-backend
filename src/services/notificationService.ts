import nodemailer from 'nodemailer';
import { Server as SocketIOServer } from 'socket.io';
import { User } from '../models/User';
import { BorrowRecord } from '../models/BorrowRecord';
import { BorrowRequest } from '../models/BorrowRequest';

export interface NotificationData {
  type: 'overdue' | 'pending_approval' | 'request_approved' | 'request_rejected' | 'book_returned' | 'system';
  title: string;
  message: string;
  userId?: string;
  libraryId?: string;
  metadata?: Record<string, any>;
}

export interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

class NotificationService {
  private io: SocketIOServer | null = null;
  private emailTransporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initializeEmailTransporter();
  }

  private initializeEmailTransporter() {
    if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      this.emailTransporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS,
        },
      });
    }
  }

  setSocketIO(io: SocketIOServer) {
    this.io = io;
  }

  // Send real-time notification via WebSocket
  async sendRealtimeNotification(notification: NotificationData) {
    if (!this.io) {
      console.warn('Socket.IO not initialized');
      return;
    }

    try {
      if (notification.userId) {
        // Send to specific user
        this.io.to(`user:${notification.userId}`).emit('notification', {
          id: Date.now().toString(),
          type: notification.type,
          title: notification.title,
          message: notification.message,
          timestamp: new Date().toISOString(),
          metadata: notification.metadata,
        });
      } else if (notification.libraryId) {
        // Send to all users in a library
        this.io.to(`library:${notification.libraryId}`).emit('notification', {
          id: Date.now().toString(),
          type: notification.type,
          title: notification.title,
          message: notification.message,
          timestamp: new Date().toISOString(),
          metadata: notification.metadata,
        });
      } else {
        // Send to all connected users
        this.io.emit('notification', {
          id: Date.now().toString(),
          type: notification.type,
          title: notification.title,
          message: notification.message,
          timestamp: new Date().toISOString(),
          metadata: notification.metadata,
        });
      }
    } catch (error) {
      console.error('Error sending real-time notification:', error);
    }
  }

  // Send email notification
  async sendEmailNotification(userId: string, notification: NotificationData) {
    if (!this.emailTransporter) {
      console.warn('Email transporter not configured');
      return;
    }

    try {
      const user = await User.findById(userId);
      if (!user) {
        console.error('User not found for email notification:', userId);
        return;
      }

      const template = this.getEmailTemplate(notification);
      
      await this.emailTransporter.sendMail({
        from: process.env.EMAIL_USER,
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      console.log(`Email notification sent to ${user.email}`);
    } catch (error) {
      console.error('Error sending email notification:', error);
    }
  }

  // Get email template based on notification type
  private getEmailTemplate(notification: NotificationData): EmailTemplate {
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    
    switch (notification.type) {
      case 'overdue':
        return {
          subject: '📚 Book Overdue Notice',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">📚 Book Overdue Notice</h2>
              <p>Hello,</p>
              <p>This is a reminder that you have an overdue book:</p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p><strong>${notification.title}</strong></p>
                <p>${notification.message}</p>
              </div>
              <p>Please return the book as soon as possible to avoid additional fees.</p>
              <a href="${baseUrl}/dashboard" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a>
            </div>
          `,
          text: `Book Overdue Notice\n\n${notification.title}\n${notification.message}\n\nPlease return the book as soon as possible.`
        };

      case 'pending_approval':
        return {
          subject: '📋 New Student Registration Pending',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #3b82f6;">📋 New Student Registration</h2>
              <p>Hello Admin,</p>
              <p>A new student registration requires your approval:</p>
              <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p><strong>${notification.title}</strong></p>
                <p>${notification.message}</p>
              </div>
              <a href="${baseUrl}/dashboard/users/pending" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">Review Pending Users</a>
            </div>
          `,
          text: `New Student Registration\n\n${notification.title}\n${notification.message}\n\nPlease review the pending registration.`
        };

      case 'request_approved':
        return {
          subject: '✅ Book Request Approved',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #059669;">✅ Book Request Approved</h2>
              <p>Great news! Your book request has been approved:</p>
              <div style="background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p><strong>${notification.title}</strong></p>
                <p>${notification.message}</p>
              </div>
              <p>You can now pick up the book from the library.</p>
              <a href="${baseUrl}/dashboard" style="background: #059669; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a>
            </div>
          `,
          text: `Book Request Approved\n\n${notification.title}\n${notification.message}\n\nYou can now pick up the book from the library.`
        };

      case 'request_rejected':
        return {
          subject: '❌ Book Request Rejected',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #dc2626;">❌ Book Request Rejected</h2>
              <p>Unfortunately, your book request has been rejected:</p>
              <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 16px 0;">
                <p><strong>${notification.title}</strong></p>
                <p>${notification.message}</p>
              </div>
              <p>Please contact the library for more information.</p>
              <a href="${baseUrl}/dashboard" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a>
            </div>
          `,
          text: `Book Request Rejected\n\n${notification.title}\n${notification.message}\n\nPlease contact the library for more information.`
        };

      default:
        return {
          subject: notification.title,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>${notification.title}</h2>
              <p>${notification.message}</p>
              <a href="${baseUrl}/dashboard" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">View Dashboard</a>
            </div>
          `,
          text: `${notification.title}\n\n${notification.message}`
        };
    }
  }

  // Send overdue book notifications
  async sendOverdueNotifications() {
    try {
      const overdueRecords = await BorrowRecord.find({
        status: { $in: ['borrowed', 'overdue'] },
        dueDate: { $lt: new Date() }
      }).populate('userId titleId libraryId');

      for (const record of overdueRecords) {
        const user = record.userId as any;
        const title = record.titleId as any;
        const library = record.libraryId as any;

        const notification: NotificationData = {
          type: 'overdue',
          title: `Overdue: ${title.title}`,
          message: `The book "${title.title}" was due on ${record.dueDate.toLocaleDateString()}. Please return it as soon as possible.`,
          userId: user._id.toString(),
          libraryId: library._id.toString(),
          metadata: {
            recordId: record._id,
            titleId: title._id,
            libraryId: library._id,
            dueDate: record.dueDate,
          }
        };

        // Send real-time notification
        await this.sendRealtimeNotification(notification);

        // Send email notification
        await this.sendEmailNotification(user._id.toString(), notification);

        // Update record status to overdue if not already
        if (record.status === 'borrowed') {
          record.status = 'overdue';
          await record.save();
        }
      }

      console.log(`Sent ${overdueRecords.length} overdue notifications`);
    } catch (error) {
      console.error('Error sending overdue notifications:', error);
    }
  }

  // Send pending approval notifications to admins
  async sendPendingApprovalNotifications() {
    try {
      const pendingUsers = await User.find({ status: 'pending', role: 'student' });
      
      if (pendingUsers.length === 0) return;

      // Get all admins
      const admins = await User.find({ 
        role: { $in: ['admin', 'superadmin'] },
        status: 'active'
      });

      const notification: NotificationData = {
        type: 'pending_approval',
        title: `${pendingUsers.length} Student Registration${pendingUsers.length > 1 ? 's' : ''} Pending`,
        message: `There ${pendingUsers.length === 1 ? 'is' : 'are'} ${pendingUsers.length} student registration${pendingUsers.length > 1 ? 's' : ''} waiting for approval.`,
        metadata: {
          pendingCount: pendingUsers.length,
          pendingUserIds: pendingUsers.map(u => u._id),
        }
      };

      // Send to all admins
      for (const admin of admins) {
        await this.sendRealtimeNotification({
          ...notification,
          userId: (admin._id as any).toString(),
        });

        await this.sendEmailNotification((admin._id as any).toString(), notification);
      }

      console.log(`Sent pending approval notifications to ${admins.length} admins`);
    } catch (error) {
      console.error('Error sending pending approval notifications:', error);
    }
  }

  // Send request status notifications
  async sendRequestStatusNotification(requestId: string, status: 'approved' | 'rejected') {
    try {
      const request = await BorrowRequest.findById(requestId)
        .populate('userId titleId libraryId');

      if (!request) return;

      const user = request.userId as any;
      const title = request.titleId as any;
      const library = request.libraryId as any;

      const notification: NotificationData = {
        type: status === 'approved' ? 'request_approved' : 'request_rejected',
        title: `Request ${status === 'approved' ? 'Approved' : 'Rejected'}: ${title.title}`,
        message: status === 'approved' 
          ? `Your request for "${title.title}" has been approved. You can now pick up the book from ${library.name}.`
          : `Your request for "${title.title}" has been rejected. ${request.notes || 'Please contact the library for more information.'}`,
        userId: user._id.toString(),
        libraryId: library._id.toString(),
        metadata: {
          requestId: request._id,
          titleId: title._id,
          libraryId: library._id,
          status,
        }
      };

      // Send real-time notification
      await this.sendRealtimeNotification(notification);

      // Send email notification
      await this.sendEmailNotification(user._id.toString(), notification);

      console.log(`Sent request ${status} notification to user ${user.email}`);
    } catch (error) {
      console.error('Error sending request status notification:', error);
    }
  }

  // Send book returned notification
  async sendBookReturnedNotification(recordId: string) {
    try {
      const record = await BorrowRecord.findById(recordId)
        .populate('userId titleId libraryId');

      if (!record) return;

      const user = record.userId as any;
      const title = record.titleId as any;
      const library = record.libraryId as any;

      const notification: NotificationData = {
        type: 'book_returned',
        title: `Book Returned: ${title.title}`,
        message: `Thank you for returning "${title.title}" to ${library.name}.`,
        userId: user._id.toString(),
        libraryId: library._id.toString(),
        metadata: {
          recordId: record._id,
          titleId: title._id,
          libraryId: library._id,
          returnDate: record.returnDate,
        }
      };

      // Send real-time notification
      await this.sendRealtimeNotification(notification);

      console.log(`Sent book returned notification to user ${user.email}`);
    } catch (error) {
      console.error('Error sending book returned notification:', error);
    }
  }
}

export const notificationService = new NotificationService();
