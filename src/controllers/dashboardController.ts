import { Request, Response } from 'express';
import { User } from '@/models/User';
import { Library } from '@/models/Library';
import { Title } from '@/models/Title';
import { BorrowRequest } from '@/models/BorrowRequest';
import { BorrowRecord } from '@/models/BorrowRecord';
import { Inventory } from '@/models/Inventory';

// Get dashboard statistics
export const getDashboardStats = async (req: Request, res: Response) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Build filters based on user role
    let libraryFilter: any = {};
    let borrowRequestFilter: any = { status: 'pending' };
    let borrowRecordFilter: any = { 
      status: { $in: ['borrowed', 'overdue'] },
      dueDate: { $lt: new Date() }
    };

    if (user.role === 'admin' && user.libraries && user.libraries.length > 0) {
      libraryFilter = { _id: { $in: user.libraries } };
      borrowRequestFilter.libraryId = { $in: user.libraries };
      borrowRecordFilter.libraryId = { $in: user.libraries };
    } else if (user.role === 'student' || user.role === 'guest') {
      // Students and guests only see their own data
      borrowRequestFilter.userId = user.userId;
      borrowRecordFilter.userId = user.userId;
    }

    // Get basic counts based on role
    const [totalBooks, totalUsers, totalLibraries, pendingRequests, overdueBooks] = await Promise.all([
      Title.countDocuments(),
      user.role === 'admin' || user.role === 'superadmin' 
        ? User.countDocuments() 
        : 1, // Students/guests don't need to see total user count
      user.role === 'admin' || user.role === 'superadmin'
        ? Library.countDocuments(libraryFilter)
        : 1, // Students/guests don't need to see total library count
      BorrowRequest.countDocuments(borrowRequestFilter),
      BorrowRecord.countDocuments(borrowRecordFilter)
    ]);

    return res.json({
      success: true,
      data: {
        totalBooks,
        totalUsers,
        totalLibraries,
        pendingRequests,
        overdueBooks
      }
    });

  } catch (error) {
    console.error('Get dashboard stats error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get dashboard statistics'
    });
  }
};

// Get recent activity
export const getRecentActivity = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const activities: any[] = [];
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // Build library filter based on user role
    let libraryFilter: any = {};
    if (user.role === 'admin' && user.libraries && user.libraries.length > 0) {
      libraryFilter = { libraryId: { $in: user.libraries } };
    }

    // Get recent borrow requests (only for admins and super admins)
    if (user.role === 'admin' || user.role === 'superadmin') {
      const recentRequests = await BorrowRequest.find({ 
        status: 'pending',
        ...libraryFilter
      })
        .populate('userId', 'name email')
        .populate('titleId', 'title authors')
        .populate('libraryId', 'name code')
        .sort({ requestedAt: -1 })
        .limit(5);

      recentRequests.forEach(request => {
        const userId = request.userId as any;
        const titleId = request.titleId as any;
        const libraryId = request.libraryId as any;
        
        activities.push({
          id: `request-${request._id}`,
          type: 'pending_approval',
          message: `${userId?.name || 'User'} requested "${titleId?.title || 'Book'}"`,
          timestamp: request.requestedAt,
          user: userId?.name,
          book: titleId?.title,
          library: libraryId?.name
        });
      });
    }

    // Get recent borrow records (returns and new loans)
    let borrowRecordFilter: any = {};
    if (user.role === 'admin' && user.libraries && user.libraries.length > 0) {
      borrowRecordFilter = { libraryId: { $in: user.libraries } };
    } else if (user.role === 'student') {
      // Students only see their own records
      borrowRecordFilter = { userId: user.userId };
    } else if (user.role === 'guest') {
      // Guests only see their own records
      borrowRecordFilter = { userId: user.userId };
    }

    const recentRecords = await BorrowRecord.find(borrowRecordFilter)
      .populate('userId', 'name email')
      .populate('titleId', 'title authors')
      .populate('libraryId', 'name code')
      .sort({ createdAt: -1 })
      .limit(5);

    recentRecords.forEach(record => {
      const userId = record.userId as any;
      const titleId = record.titleId as any;
      const libraryId = record.libraryId as any;
      
      if (record.status === 'returned') {
        activities.push({
          id: `return-${record._id}`,
          type: 'book_returned',
          message: (user.role === 'student' || user.role === 'guest')
            ? `You returned "${titleId?.title || 'Book'}"`
            : `${userId?.name || 'User'} returned "${titleId?.title || 'Book'}"`,
          timestamp: record.returnDate || record.updatedAt,
          user: userId?.name,
          book: titleId?.title,
          library: libraryId?.name
        });
      } else if (record.status === 'borrowed') {
        activities.push({
          id: `borrow-${record._id}`,
          type: 'book_borrowed',
          message: (user.role === 'student' || user.role === 'guest')
            ? `You borrowed "${titleId?.title || 'Book'}"`
            : `${userId?.name || 'User'} borrowed "${titleId?.title || 'Book'}"`,
          timestamp: record.borrowDate,
          user: userId?.name,
          book: titleId?.title,
          library: libraryId?.name
        });
      }
    });

    // Get recent user registrations (only for admins and super admins)
    if (user.role === 'admin' || user.role === 'superadmin') {
      const recentUsers = await User.find({ status: 'active' })
        .sort({ createdAt: -1 })
        .limit(3);

      recentUsers.forEach(newUser => {
        activities.push({
          id: `user-${newUser._id}`,
          type: 'user_registration',
          message: `${newUser.name} registered as ${newUser.role}`,
          timestamp: newUser.createdAt,
          user: newUser.name
        });
      });
    }

    // Get recent book additions (only for admins and super admins)
    if (user.role === 'admin' || user.role === 'superadmin') {
      const recentTitles = await Title.find()
        .sort({ createdAt: -1 })
        .limit(3);

      recentTitles.forEach(title => {
        activities.push({
          id: `title-${title._id}`,
          type: 'book_added',
          message: `"${title.title}" by ${title.authors.join(', ')} added to catalog`,
          timestamp: title.createdAt,
          book: title.title
        });
      });
    }

    // Get overdue books (role-based filtering)
    let overdueFilter: any = { 
      status: { $in: ['borrowed', 'overdue'] },
      dueDate: { $lt: new Date() }
    };

    if (user.role === 'admin' && user.libraries && user.libraries.length > 0) {
      overdueFilter.libraryId = { $in: user.libraries };
    } else if (user.role === 'student') {
      // Students only see their own overdue books
      overdueFilter.userId = user.userId;
    } else if (user.role === 'guest') {
      // Guests only see their own overdue books
      overdueFilter.userId = user.userId;
    }

    const overdueRecords = await BorrowRecord.find(overdueFilter)
      .populate('userId', 'name email')
      .populate('titleId', 'title authors')
      .populate('libraryId', 'name code')
      .sort({ dueDate: -1 })
      .limit(3);

    overdueRecords.forEach(record => {
      const userId = record.userId as any;
      const titleId = record.titleId as any;
      const libraryId = record.libraryId as any;
      
      activities.push({
        id: `overdue-${record._id}`,
        type: 'overdue',
        message: (user.role === 'student' || user.role === 'guest')
          ? `"${titleId?.title || 'Book'}" is overdue (due ${new Date(record.dueDate).toLocaleDateString()})`
          : `"${titleId?.title || 'Book'}" is overdue (due ${new Date(record.dueDate).toLocaleDateString()}) - ${userId?.name || 'User'}`,
        timestamp: record.dueDate,
        user: userId?.name,
        book: titleId?.title,
        library: libraryId?.name
      });
    });

    // Sort all activities by timestamp (most recent first) and limit
    const sortedActivities = activities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit);

    return res.json({
      success: true,
      data: {
        activities: sortedActivities
      }
    });

  } catch (error) {
    console.error('Get recent activity error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get recent activity'
    });
  }
};