import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Library } from '@/models/Library';
import { User } from '@/models/User';

// Validation rules
export const createLibraryValidation = [
  body('code')
    .trim()
    .isLength({ min: 2, max: 20 })
    .withMessage('Library code must be between 2 and 20 characters')
    .matches(/^[A-Z0-9\-_]+$/)
    .withMessage('Library code can only contain uppercase letters, numbers, hyphens, and underscores'),
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Library name must be between 2 and 100 characters'),
  body('location.address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City cannot exceed 50 characters'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country cannot exceed 50 characters'),
  body('contact.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('contact.phone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]+$/)
    .withMessage('Please provide a valid phone number')
];

export const updateLibraryValidation = [
  body('code')
    .optional()
    .trim()
    .isLength({ min: 2, max: 20 })
    .withMessage('Library code must be between 2 and 20 characters')
    .matches(/^[A-Z0-9\-_]+$/)
    .withMessage('Library code can only contain uppercase letters, numbers, hyphens, and underscores'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Library name must be between 2 and 100 characters'),
  body('location.address')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Address cannot exceed 200 characters'),
  body('location.city')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('City cannot exceed 50 characters'),
  body('location.state')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('State cannot exceed 50 characters'),
  body('location.country')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Country cannot exceed 50 characters'),
  body('contact.email')
    .optional()
    .isEmail()
    .normalizeEmail()
    .withMessage('Please provide a valid email'),
  body('contact.phone')
    .optional()
    .matches(/^\+?[\d\s\-\(\)]+$/)
    .withMessage('Please provide a valid phone number')
];

// Get all libraries
export const getLibraries = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;

    // Build query
    const query: any = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;

    const [libraries, total] = await Promise.all([
      Library.find(query)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Library.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { libraries },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get libraries error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get libraries'
    });
  }
};

// Get library by ID
export const getLibraryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const library = await Library.findById(id);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    return res.json({
      success: true,
      data: { library }
    });

  } catch (error) {
    console.error('Get library error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get library'
    });
  }
};

// Create new library
export const createLibrary = async (req: Request, res: Response) => {
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

    const { code, name, location, contact } = req.body;

    // Check if library code already exists
    const existingLibrary = await Library.findOne({ code: code.toUpperCase() });
    if (existingLibrary) {
      return res.status(409).json({
        success: false,
        error: 'Library with this code already exists'
      });
    }

    // Create new library
    const library = new Library({
      code: code.toUpperCase(),
      name,
      location,
      contact
    });

    await library.save();

    return res.status(201).json({
      success: true,
      message: 'Library created successfully',
      data: { library }
    });

  } catch (error) {
    console.error('Create library error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create library'
    });
  }
};

// Update library
export const updateLibrary = async (req: Request, res: Response) => {
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
    const allowedUpdates = ['code', 'name', 'location', 'contact'];
    
    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // If updating code, check for uniqueness
    if (updates.code) {
      const existingLibrary = await Library.findOne({ 
        code: updates.code.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingLibrary) {
        return res.status(409).json({
          success: false,
          error: 'Library with this code already exists'
        });
      }
      updates.code = updates.code.toUpperCase();
    }

    const library = await Library.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    return res.json({
      success: true,
      message: 'Library updated successfully',
      data: { library }
    });

  } catch (error) {
    console.error('Update library error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update library'
    });
  }
};

// Delete library
export const deleteLibrary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if library exists
    const library = await Library.findById(id);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    // Check for active borrow records (books currently borrowed from this library)
    const BorrowRecord = require('@/models/BorrowRecord').BorrowRecord;
    const activeBorrows = await BorrowRecord.countDocuments({ 
      libraryId: id, 
      status: { $in: ['borrowed', 'overdue'] } 
    });

    if (activeBorrows > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete library with active book loans. Please return all borrowed books first.'
      });
    }

    // Check for pending borrow requests
    const BorrowRequest = require('@/models/BorrowRequest').BorrowRequest;
    const pendingRequests = await BorrowRequest.countDocuments({ 
      libraryId: id, 
      status: 'pending' 
    });

    if (pendingRequests > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete library with pending borrow requests. Please process all requests first.'
      });
    }

    // Get all related data counts for confirmation
    const Inventory = require('@/models/Inventory').Inventory;
    const Copy = require('@/models/Copy').Copy;
    const User = require('@/models/User').User;
    
    const [inventoryCount, copyCount, borrowRecordCount, borrowRequestCount, userAssignmentsCount] = await Promise.all([
      Inventory.countDocuments({ libraryId: id }),
      Copy.countDocuments({ libraryId: id }),
      BorrowRecord.countDocuments({ libraryId: id }),
      BorrowRequest.countDocuments({ libraryId: id }),
      User.countDocuments({ libraries: id })
    ]);

    // Perform cascade deletion
    const deletionResults = {
      inventoriesDeleted: 0,
      copiesDeleted: 0,
      borrowRecordsDeleted: 0,
      borrowRequestsDeleted: 0,
      userAssignmentsRemoved: 0
    };

    // Delete all borrow records (completed/returned ones)
    if (borrowRecordCount > 0) {
      const borrowRecordResult = await BorrowRecord.deleteMany({ libraryId: id });
      deletionResults.borrowRecordsDeleted = borrowRecordResult.deletedCount || 0;
    }

    // Delete all borrow requests (cancelled/rejected ones)
    if (borrowRequestCount > 0) {
      const borrowRequestResult = await BorrowRequest.deleteMany({ libraryId: id });
      deletionResults.borrowRequestsDeleted = borrowRequestResult.deletedCount || 0;
    }

    // Delete all copies
    if (copyCount > 0) {
      const copyResult = await Copy.deleteMany({ libraryId: id });
      deletionResults.copiesDeleted = copyResult.deletedCount || 0;
    }

    // Delete all inventories
    if (inventoryCount > 0) {
      const inventoryResult = await Inventory.deleteMany({ libraryId: id });
      deletionResults.inventoriesDeleted = inventoryResult.deletedCount || 0;
    }

    // Remove library from all user assignments
    if (userAssignmentsCount > 0) {
      const userResult = await User.updateMany(
        { libraries: id },
        { $pull: { libraries: id } }
      );
      deletionResults.userAssignmentsRemoved = userResult.modifiedCount || 0;
    }

    // Finally, delete the library itself
    await Library.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Library and all related data deleted successfully',
      data: {
        libraryDeleted: true,
        ...deletionResults
      }
    });

  } catch (error) {
    console.error('Delete library error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete library'
    });
  }
};

// Assign admin to library
export const assignAdminToLibrary = async (req: Request, res: Response) => {
  try {
    const { libraryId, userId } = req.params;

    // Check if library exists
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    // Check if user exists and is an admin
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'User is not an admin'
      });
    }

    // Add library to user's libraries array if not already present
    if (!user.libraries?.includes(libraryId)) {
      user.libraries = [...(user.libraries || []), libraryId];
      await user.save();
    }

    return res.json({
      success: true,
      message: 'Admin assigned to library successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Assign admin error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to assign admin to library'
    });
  }
};

// Remove admin from library
export const removeAdminFromLibrary = async (req: Request, res: Response) => {
  try {
    const { libraryId, userId } = req.params;

    // Check if user exists and is an admin
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (user.role !== 'admin') {
      return res.status(400).json({
        success: false,
        error: 'User is not an admin'
      });
    }

    // Remove library from user's libraries array
    if (user.libraries) {
      user.libraries = user.libraries.filter(id => id.toString() !== libraryId);
      await user.save();
    }

    return res.json({
      success: true,
      message: 'Admin removed from library successfully',
      data: { user }
    });

  } catch (error) {
    console.error('Remove admin error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to remove admin from library'
    });
  }
};

// Get library admins
export const getLibraryAdmins = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if library exists
    const library = await Library.findById(id);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    // Find all admins assigned to this library
    const admins = await User.find({
      role: 'admin',
      libraries: id
    }).select('-passwordHash');

    return res.json({
      success: true,
      data: { admins }
    });

  } catch (error) {
    console.error('Get library admins error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get library admins'
    });
  }
};
