import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { BorrowRequest } from '@/models/BorrowRequest';
import { Inventory } from '@/models/Inventory';
import { Copy } from '@/models/Copy';
import { Title } from '@/models/Title';
import { Library } from '@/models/Library';
import { BorrowRecord } from '@/models/BorrowRecord';

// Validation rules
export const createBorrowRequestValidation = [
  body('libraryId')
    .isMongoId()
    .withMessage('Valid library ID is required'),
  body('titleId')
    .isMongoId()
    .withMessage('Valid title ID is required'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

export const updateBorrowRequestValidation = [
  body('status')
    .isIn(['pending', 'approved', 'rejected', 'cancelled'])
    .withMessage('Invalid status'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Get all borrow requests with filtering
export const getBorrowRequests = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const libraryId = req.query.libraryId as string;
    const userId = req.query.userId as string;
    const status = req.query.status as string;
    const titleId = req.query.titleId as string;

    // Build query
    const query: any = {};
    
    if (libraryId) query.libraryId = libraryId;
    if (userId) query.userId = userId;
    if (status) query.status = status;
    if (titleId) query.titleId = titleId;

    // Admin scope: only show requests for their assigned libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      query.libraryId = { $in: req.user.libraries };
    }

    // Student scope: only show their own requests
    if (req.user?.role === 'student') {
      query.userId = req.user.userId;
    }

    // Guest scope: only show their own requests
    if (req.user?.role === 'guest') {
      query.userId = req.user.userId;
    }

    const skip = (page - 1) * limit;

    const [requests, total] = await Promise.all([
      BorrowRequest.find(query)
        .populate('userId', 'name email role')
        .populate('libraryId', 'name code')
        .populate('titleId', 'title authors isbn13 isbn10')
        .populate('inventoryId')
        .populate('copyId', 'barcode condition')
        .populate('decidedBy', 'name email')
        .sort({ requestedAt: -1 })
        .skip(skip)
        .limit(limit),
      BorrowRequest.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { requests },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get borrow requests error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get borrow requests'
    });
  }
};

// Get borrow request by ID
export const getBorrowRequestById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const request = await BorrowRequest.findById(id)
      .populate('userId', 'name email role')
      .populate('libraryId', 'name code')
      .populate('titleId', 'title authors isbn13 isbn10')
      .populate('inventoryId')
      .populate('copyId', 'barcode condition')
      .populate('decidedBy', 'name email');

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Borrow request not found'
      });
    }

    // Check access permissions
    if (req.user?.role === 'student' || req.user?.role === 'guest') {
      if (request.userId.toString() !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    if (req.user?.role === 'admin' && req.user.libraries) {
      if (!req.user.libraries.includes(request.libraryId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this library'
        });
      }
    }

    return res.json({
      success: true,
      data: { request }
    });

  } catch (error) {
    console.error('Get borrow request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get borrow request'
    });
  }
};

// Create new borrow request
export const createBorrowRequest = async (req: Request, res: Response) => {
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

    const { libraryId, titleId, notes } = req.body;
    const userId = req.user!.userId;

    // Check if library exists
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    // Check if title exists
    const title = await Title.findById(titleId);
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }

    // Check if inventory exists for this library and title
    const inventory = await Inventory.findOne({ libraryId, titleId });
    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'This title is not available in the selected library'
      });
    }

    // Check if there are available copies
    if (inventory.availableCopies <= 0) {
      return res.status(400).json({
        success: false,
        error: 'No copies available for this title'
      });
    }

    // Check if user already has a pending request for this title in this library
    const existingRequest = await BorrowRequest.findOne({
      userId,
      libraryId,
      titleId,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(409).json({
        success: false,
        error: 'You already have a pending request for this title'
      });
    }

    // Create new borrow request
    const request = new BorrowRequest({
      userId,
      libraryId,
      titleId,
      inventoryId: inventory._id,
      status: 'pending',
      notes
    });

    await request.save();

    // Populate the request for response
    await request.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' },
      { path: 'inventoryId' }
    ]);

    return res.status(201).json({
      success: true,
      message: 'Borrow request created successfully',
      data: { request }
    });

  } catch (error) {
    console.error('Create borrow request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create borrow request'
    });
  }
};

// Update borrow request (approve/reject)
export const updateBorrowRequest = async (req: Request, res: Response) => {
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
    const { status, notes } = req.body;
    const decidedBy = req.user!.userId;

    const request = await BorrowRequest.findById(id)
      .populate('inventoryId')
      .populate('titleId', 'title authors');

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Borrow request not found'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Request has already been processed'
      });
    }

    // Check library access for admins
    if (req.user?.role === 'admin' && req.user.libraries) {
      if (!req.user.libraries.includes(request.libraryId.toString())) {
        return res.status(403).json({
          success: false,
          error: 'Access denied to this library'
        });
      }
    }

    // Update request
    request.status = status;
    request.decidedBy = decidedBy;
    request.decidedAt = new Date();
    if (notes) request.notes = notes;

    // If approved, assign a copy and create borrow record
    if (status === 'approved') {
      // Find an available copy
      const availableCopy = await Copy.findOne({
        inventoryId: request.inventoryId,
        status: 'available'
      });

      if (!availableCopy) {
        return res.status(400).json({
          success: false,
          error: 'No available copies found'
        });
      }

      // Assign copy to request
      request.copyId = (availableCopy._id as any).toString();

      // Create borrow record
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14); // 14 days from now

      const borrowRecord = new BorrowRecord({
        userId: request.userId,
        libraryId: request.libraryId,
        titleId: request.titleId,
        inventoryId: request.inventoryId,
        copyId: availableCopy._id,
        borrowDate: new Date(),
        dueDate,
        status: 'borrowed',
        approvedBy: decidedBy
      });

      await borrowRecord.save();

      // Update copy status
      availableCopy.status = 'borrowed';
      await availableCopy.save();

      // Update inventory available copies count
      await (Inventory as any).updateCopyCounts(request.inventoryId);
    }

    await request.save();

    // Populate the updated request
    await request.populate([
      { path: 'userId', select: 'name email role' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' },
      { path: 'inventoryId' },
      { path: 'copyId', select: 'barcode condition' },
      { path: 'decidedBy', select: 'name email' }
    ]);

    return res.json({
      success: true,
      message: `Request ${status} successfully`,
      data: { request }
    });

  } catch (error) {
    console.error('Update borrow request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update borrow request'
    });
  }
};

// Cancel borrow request
export const cancelBorrowRequest = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user!.userId;

    const request = await BorrowRequest.findById(id);

    if (!request) {
      return res.status(404).json({
        success: false,
        error: 'Borrow request not found'
      });
    }

    // Check if user owns this request
    if (request.userId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if request is still pending
    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        error: 'Only pending requests can be cancelled'
      });
    }

    // Update request status
    request.status = 'cancelled';
    request.decidedAt = new Date();
    await request.save();

    return res.json({
      success: true,
      message: 'Request cancelled successfully',
      data: { request }
    });

  } catch (error) {
    console.error('Cancel borrow request error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to cancel borrow request'
    });
  }
};

// Get pending requests
export const getPendingRequests = async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.query;

    const query: any = { status: 'pending' };
    
    if (libraryId) {
      query.libraryId = libraryId;
    }

    // Admin scope: only show requests for their assigned libraries
    if (req.user?.role === 'admin' && req.user.libraries) {
      query.libraryId = { $in: req.user.libraries };
    }

    const requests = await BorrowRequest.findPending(libraryId as string);

    return res.json({
      success: true,
      data: { requests }
    });

  } catch (error) {
    console.error('Get pending requests error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get pending requests'
    });
  }
};

// Get user requests
export const getUserRequests = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const { status } = req.query;

    // Check if user is requesting their own data or is an admin
    if (req.user?.role === 'student' || req.user?.role === 'guest') {
      if (userId !== req.user.userId) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }
    }

    const requests = await BorrowRequest.findByUser(userId, status as any);

    return res.json({
      success: true,
      data: { requests }
    });

  } catch (error) {
    console.error('Get user requests error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get user requests'
    });
  }
};
