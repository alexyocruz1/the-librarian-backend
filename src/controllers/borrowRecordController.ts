import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { BorrowRecord } from '@/models/BorrowRecord';
import { Copy } from '@/models/Copy';
import { Inventory } from '@/models/Inventory';

// Validation rules
export const updateBorrowRecordValidation = [
  body('status')
    .isIn(['borrowed', 'returned', 'overdue', 'lost'])
    .withMessage('Invalid status'),
  body('fees.lateFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Late fee must be a non-negative number'),
  body('fees.damageFee')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Damage fee must be a non-negative number'),
  body('fees.currency')
    .optional()
    .isLength({ min: 3, max: 3 })
    .withMessage('Currency must be a 3-character code')
];

// Get all borrow records with filtering
export const getBorrowRecords = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const libraryId = req.query.libraryId as string;
    const userId = req.query.userId as string;
    const status = req.query.status as string;
    const overdue = req.query.overdue === 'true';

    // Build query
    const query: any = {};
    
    if (libraryId) query.libraryId = libraryId;
    if (userId) query.userId = userId;
    if (status) query.status = status;
    
    if (overdue) {
      query.status = { $in: ['borrowed', 'overdue'] };
      query.dueDate = { $lt: new Date() };
    }

    // Admin scope: only show records for their assigned libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      query.libraryId = { $in: req.user.libraries };
    }

    // Student scope: only show their own records
    if (req.user?.role === 'student') {
      query.userId = req.user.userId;
    }

    // Guest scope: only show their own records
    if (req.user?.role === 'guest') {
      query.userId = req.user.userId;
    }

    const skip = (page - 1) * limit;

    const [records, total] = await Promise.all([
      BorrowRecord.find(query)
        .populate('userId', 'name email role')
        .populate('libraryId', 'name code')
        .populate('titleId', 'title authors isbn13 isbn10')
        .populate('inventoryId')
        .populate('copyId', 'barcode condition')
        .populate('approvedBy', 'name email')
        .sort({ borrowDate: -1 })
        .skip(skip)
        .limit(limit),
      BorrowRecord.countDocuments(query)
    ]);

    res.json({
      success: true,
      data: { records },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get borrow records error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get borrow records'
    });
  }
};

// Get borrow record by ID
export const getBorrowRecordById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const record = await BorrowRecord.findById(id)
      .populate('userId', 'name email role')
      .populate('libraryId', 'name code')
      .populate('titleId', 'title authors isbn13 isbn10')
      .populate('inventoryId')
      .populate('copyId', 'barcode condition')
      .populate('approvedBy', 'name email');

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Borrow record not found'
      });
    }

    // Check access permissions
    if (req.user?.role === 'student' || req.user?.role === 'guest') {
      if (record.userId.toString() !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    if (req.user?.role === 'admin' && req.user.libraries) {
      if (!req.user.libraries.includes(record.libraryId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this library'
        });
      }
    }

    res.json({
      success: true,
      data: { record }
    });

  } catch (error) {
    console.error('Get borrow record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get borrow record'
    });
  }
};

// Update borrow record (return book, mark as lost, etc.)
export const updateBorrowRecord = async (req: Request, res: Response) => {
  try {
    // Check validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: errors.array()
      });
    }

    const { id } = req.params;
    const { status, fees } = req.body;

    const record = await BorrowRecord.findById(id)
      .populate('copyId');

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Borrow record not found'
      });
    }

    // Check library access for admins
    if (req.user?.role === 'admin' && req.user.libraries) {
      if (!req.user.libraries.includes(record.libraryId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this library'
        });
      }
    }

    // Update record
    const oldStatus = record.status;
    record.status = status;

    if (fees) {
      record.fees = { ...record.fees, ...fees };
    }

    // If returning the book
    if (status === 'returned' && oldStatus !== 'returned') {
      record.returnDate = new Date();
      
      // Update copy status to available
      if (record.copyId) {
        const copy = record.copyId as any;
        copy.status = 'available';
        await copy.save();

        // Update inventory available copies count
        await Inventory.updateCopyCounts(record.inventoryId);
      }
    }

    // If marking as lost
    if (status === 'lost' && oldStatus !== 'lost') {
      // Update copy status to lost
      if (record.copyId) {
        const copy = record.copyId as any;
        copy.status = 'lost';
        await copy.save();

        // Update inventory available copies count
        await Inventory.updateCopyCounts(record.inventoryId);
      }
    }

    await record.save();

    // Populate the updated record
    await record.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' },
      { path: 'inventoryId' },
      { path: 'copyId', select: 'barcode condition' },
      { path: 'approvedBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: `Record updated to ${status} successfully`,
      data: { record }
    });

  } catch (error) {
    console.error('Update borrow record error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update borrow record'
    });
  }
};

// Get active loans
export const getActiveLoans = async (req: Request, res: Response) => {
  try {
    const { userId, libraryId } = req.query;

    const query: any = { status: { $in: ['borrowed', 'overdue'] } };
    
    if (userId) query.userId = userId;
    if (libraryId) query.libraryId = libraryId;

    // Admin scope: only show loans for their assigned libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      query.libraryId = { $in: req.user.libraries };
    }

    // Student scope: only show their own loans
    if (req.user?.role === 'student') {
      query.userId = req.user.userId;
    }

    // Guest scope: only show their own loans
    if (req.user?.role === 'guest') {
      query.userId = req.user.userId;
    }

    const loans = await BorrowRecord.findActive(
      userId as string, 
      libraryId as string
    );

    res.json({
      success: true,
      data: { loans }
    });

  } catch (error) {
    console.error('Get active loans error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active loans'
    });
  }
};

// Get overdue records
export const getOverdueRecords = async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.query;

    const query: any = { 
      status: { $in: ['borrowed', 'overdue'] },
      dueDate: { $lt: new Date() }
    };
    
    if (libraryId) query.libraryId = libraryId;

    // Admin scope: only show overdue records for their assigned libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      query.libraryId = { $in: req.user.libraries };
    }

    const overdueRecords = await BorrowRecord.findOverdue(libraryId as string);

    res.json({
      success: true,
      data: { overdueRecords }
    });

  } catch (error) {
    console.error('Get overdue records error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get overdue records'
    });
  }
};

// Get user history
export const getUserHistory = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { limit = 50 } = req.query;

    // Check if user is requesting their own data or is an admin
    if (req.user?.role === 'student' || req.user?.role === 'guest') {
      if (userId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    const history = await BorrowRecord.findByUser(userId, parseInt(limit as string));

    res.json({
      success: true,
      data: { history }
    });

  } catch (error) {
    console.error('Get user history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user history'
    });
  }
};

// Return book
export const returnBook = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { fees } = req.body;

    const record = await BorrowRecord.findById(id)
      .populate('copyId');

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Borrow record not found'
      });
    }

    // Check if book is already returned
    if (record.status === 'returned') {
      return res.status(400).json({
        success: false,
        error: 'Book is already returned'
      });
    }

    // Check library access for admins
    if (req.user?.role === 'admin' && req.user.libraries) {
      if (!req.user.libraries.includes(record.libraryId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this library'
        });
      }
    }

    // Update record
    record.status = 'returned';
    record.returnDate = new Date();
    
    if (fees) {
      record.fees = { ...record.fees, ...fees };
    }

    // Update copy status to available
    if (record.copyId) {
      const copy = record.copyId as any;
      copy.status = 'available';
      await copy.save();

      // Update inventory available copies count
      await Inventory.updateCopyCounts(record.inventoryId);
    }

    await record.save();

    // Populate the updated record
    await record.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' },
      { path: 'inventoryId' },
      { path: 'copyId', select: 'barcode condition' },
      { path: 'approvedBy', select: 'name email' }
    ]);

    res.json({
      success: true,
      message: 'Book returned successfully',
      data: { record }
    });

  } catch (error) {
    console.error('Return book error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to return book'
    });
  }
};
