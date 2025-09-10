import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Copy } from '@/models/Copy';
import { Inventory } from '@/models/Inventory';
import { Library } from '@/models/Library';
import { Title } from '@/models/Title';

// Validation rules
export const createCopyValidation = [
  body('inventoryId')
    .isMongoId()
    .withMessage('Valid inventory ID is required'),
  body('libraryId')
    .isMongoId()
    .withMessage('Valid library ID is required'),
  body('titleId')
    .isMongoId()
    .withMessage('Valid title ID is required'),
  body('barcode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Barcode cannot exceed 50 characters'),
  body('status')
    .optional()
    .isIn(['available', 'borrowed', 'reserved', 'lost', 'maintenance'])
    .withMessage('Invalid status'),
  body('condition')
    .optional()
    .isIn(['new', 'good', 'used', 'worn', 'damaged'])
    .withMessage('Invalid condition'),
  body('shelfLocation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Shelf location cannot exceed 100 characters')
];

export const updateCopyValidation = [
  body('barcode')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Barcode cannot exceed 50 characters'),
  body('status')
    .optional()
    .isIn(['available', 'borrowed', 'reserved', 'lost', 'maintenance'])
    .withMessage('Invalid status'),
  body('condition')
    .optional()
    .isIn(['new', 'good', 'used', 'worn', 'damaged'])
    .withMessage('Invalid condition'),
  body('shelfLocation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Shelf location cannot exceed 100 characters'),
  body('acquiredAt')
    .optional()
    .custom((value) => {
      if (value && !new Date(value).getTime()) {
        throw new Error('Invalid acquisition date format');
      }
      return true;
    })
    .withMessage('Invalid acquisition date format')
];

// Get all copies with filtering
export const getCopies = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const libraryId = req.query.libraryId as string;
    const titleId = req.query.titleId as string;
    const inventoryId = req.query.inventoryId as string;
    const status = req.query.status as string;
    const condition = req.query.condition as string;
    const barcode = req.query.barcode as string;

    // Build query
    const query: any = {};
    
    if (libraryId) query.libraryId = libraryId;
    if (titleId) query.titleId = titleId;
    if (inventoryId) query.inventoryId = inventoryId;
    if (status) query.status = status;
    if (condition) query.condition = condition;
    if (barcode) query.barcode = { $regex: barcode, $options: 'i' };

    const skip = (page - 1) * limit;

    const [copies, total] = await Promise.all([
      Copy.find(query)
        .populate('inventoryId')
        .populate('libraryId', 'name code')
        .populate('titleId', 'title authors isbn13 isbn10')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Copy.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { copies },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get copies error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get copies'
    });
  }
};

// Get copy by ID
export const getCopyById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const copy = await Copy.findById(id)
      .populate('inventoryId')
      .populate('libraryId', 'name code')
      .populate('titleId', 'title authors isbn13 isbn10');

    if (!copy) {
      return res.status(404).json({
        success: false,
        error: 'Copy not found'
      });
    }

    return res.json({
      success: true,
      data: { copy }
    });

  } catch (error) {
    console.error('Get copy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get copy'
    });
  }
};

// Create new copy
export const createCopy = async (req: Request, res: Response) => {
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

    const { inventoryId, libraryId, titleId, barcode, status, condition, shelfLocation } = req.body;

    // Check if inventory exists
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'Inventory not found'
      });
    }

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

    // Check if barcode already exists in the library
    if (barcode) {
      const existingCopy = await Copy.findOne({ 
        libraryId, 
        barcode: barcode.toUpperCase() 
      });
      if (existingCopy) {
        return res.status(409).json({
          success: false,
          error: 'Copy with this barcode already exists in this library'
        });
      }
    }

    // Create new copy
    const copy = new Copy({
      inventoryId,
      libraryId,
      titleId,
      barcode: barcode?.toUpperCase(),
      status: status || 'available',
      condition: condition || 'good',
      shelfLocation: shelfLocation || inventory.shelfLocation
    });

    await copy.save();

    // Populate the copy for response
    await copy.populate([
      { path: 'inventoryId' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' }
    ]);

    return res.status(201).json({
      success: true,
      message: 'Copy created successfully',
      data: { copy }
    });

  } catch (error) {
    console.error('Create copy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create copy'
    });
  }
};

// Update copy
export const updateCopy = async (req: Request, res: Response) => {
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
    const allowedUpdates = ['barcode', 'status', 'condition', 'shelfLocation', 'acquiredAt'];
    
    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        if (key === 'acquiredAt' && req.body[key]) {
          // Convert acquiredAt string to Date object, preserving the local date
          const dateStr = req.body[key];
          // If it's just a date string (YYYY-MM-DD), treat it as local date
          if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // Create date in local timezone to avoid timezone conversion issues
            const [year, month, day] = dateStr.split('-').map(Number);
            updates[key] = new Date(year, month - 1, day);
          } else {
            updates[key] = new Date(dateStr);
          }
        } else {
          updates[key] = req.body[key];
        }
      }
    });

    // Check barcode uniqueness if updating
    if (updates.barcode) {
      const copy = await Copy.findById(id);
      if (!copy) {
        return res.status(404).json({
          success: false,
          error: 'Copy not found'
        });
      }

      const existingCopy = await Copy.findOne({ 
        libraryId: copy.libraryId,
        barcode: updates.barcode.toUpperCase(),
        _id: { $ne: id }
      });
      if (existingCopy) {
        return res.status(409).json({
          success: false,
          error: 'Copy with this barcode already exists in this library'
        });
      }
      updates.barcode = updates.barcode.toUpperCase();
    }

    const updatedCopy = await Copy.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'inventoryId' },
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' }
    ]);

    if (!updatedCopy) {
      return res.status(404).json({
        success: false,
        error: 'Copy not found'
      });
    }

    return res.json({
      success: true,
      message: 'Copy updated successfully',
      data: { copy: updatedCopy }
    });

  } catch (error) {
    console.error('Update copy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update copy'
    });
  }
};

// Delete copy
export const deleteCopy = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const copy = await Copy.findById(id);
    if (!copy) {
      return res.status(404).json({
        success: false,
        error: 'Copy not found'
      });
    }

    // Check if copy is currently borrowed
    if (copy.status === 'borrowed') {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete a copy that is currently borrowed'
      });
    }

    await copy.deleteOne();

    return res.json({
      success: true,
      message: 'Copy deleted successfully'
    });

  } catch (error) {
    console.error('Delete copy error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete copy'
    });
  }
};

// Get available copies
export const getAvailableCopies = async (req: Request, res: Response) => {
  try {
    const { libraryId, titleId } = req.query;

    const copies = await Copy.findAvailable(
      libraryId as string, 
      titleId as string
    );

    return res.json({
      success: true,
      data: { copies }
    });

  } catch (error) {
    console.error('Get available copies error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get available copies'
    });
  }
};

// Get copy by barcode
export const getCopyByBarcode = async (req: Request, res: Response) => {
  try {
    const { barcode } = req.params;
    const { libraryId } = req.query;

    const copy = await Copy.findByBarcode(
      barcode, 
      libraryId as string
    );

    if (!copy) {
      return res.status(404).json({
        success: false,
        error: 'Copy not found'
      });
    }

    return res.json({
      success: true,
      data: { copy }
    });

  } catch (error) {
    console.error('Get copy by barcode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get copy by barcode'
    });
  }
};

// Generate barcode for copy
export const generateBarcode = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const copy = await Copy.findById(id)
      .populate('libraryId', 'code');
    
    if (!copy) {
      return res.status(404).json({
        success: false,
        error: 'Copy not found'
      });
    }

    if (copy.barcode) {
      return res.json({
        success: true,
        message: 'Copy already has a barcode',
        data: { barcode: copy.barcode }
      });
    }

    // Generate barcode using the library code and year
    const library = copy.libraryId as any;
    const year = new Date().getFullYear();
    const count = await Copy.countDocuments({ 
      libraryId: copy.libraryId,
      barcode: { $regex: `^${library.code}-${year}-` }
    });
    
    const barcode = `${library.code}-${year}-${String(count + 1).padStart(4, '0')}`;
    
    copy.barcode = barcode;
    await copy.save();

    return res.json({
      success: true,
      message: 'Barcode generated successfully',
      data: { barcode }
    });

  } catch (error) {
    console.error('Generate barcode error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate barcode'
    });
  }
};
