import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Inventory } from '@/models/Inventory';
import { Title } from '@/models/Title';
import { Library } from '@/models/Library';
import { Copy } from '@/models/Copy';

// Validation rules
export const createInventoryValidation = [
  body('libraryId')
    .isMongoId()
    .withMessage('Valid library ID is required'),
  body('titleId')
    .isMongoId()
    .withMessage('Valid title ID is required'),
  body('totalCopies')
    .isInt({ min: 0 })
    .withMessage('Total copies must be a non-negative integer'),
  body('shelfLocation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Shelf location cannot exceed 100 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

export const updateInventoryValidation = [
  body('totalCopies')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Total copies must be a non-negative integer'),
  body('shelfLocation')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Shelf location cannot exceed 100 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters')
];

// Get all inventories with filtering
export const getInventories = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const libraryId = req.query.libraryId as string;
    const titleId = req.query.titleId as string;
    const availableOnly = req.query.availableOnly === 'true';

    // Build query
    const query: any = {};
    
    if (libraryId) query.libraryId = libraryId;
    if (titleId) query.titleId = titleId;
    if (availableOnly) query.availableCopies = { $gt: 0 };

    const skip = (page - 1) * limit;

    const [inventories, total] = await Promise.all([
      Inventory.find(query)
        .populate('libraryId', 'name code')
        .populate('titleId', 'title authors isbn13 isbn10')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Inventory.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { inventories },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get inventories error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get inventories'
    });
  }
};

// Get inventory by ID
export const getInventoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id)
      .populate('libraryId', 'name code')
      .populate('titleId', 'title authors isbn13 isbn10');

    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'Inventory not found'
      });
    }

    return res.json({
      success: true,
      data: { inventory }
    });

  } catch (error) {
    console.error('Get inventory error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get inventory'
    });
  }
};

// Create new inventory
export const createInventory = async (req: Request, res: Response) => {
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

    const { libraryId, titleId, totalCopies, shelfLocation, notes } = req.body;

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

    // Check if inventory already exists for this library-title combination
    const existingInventory = await Inventory.findOne({ libraryId, titleId });
    if (existingInventory) {
      return res.status(409).json({
        success: false,
        error: 'Inventory already exists for this title in this library'
      });
    }

    // Create new inventory
    const inventory = new Inventory({
      libraryId,
      titleId,
      totalCopies,
      availableCopies: totalCopies, // Initially all copies are available
      shelfLocation,
      notes
    });

    await inventory.save();

    // Create copies for the inventory
    const copies = [];
    for (let i = 0; i < totalCopies; i++) {
      const copy = new Copy({
        inventoryId: inventory._id,
        libraryId,
        titleId,
        status: 'available',
        condition: 'good',
        shelfLocation: shelfLocation || inventory.shelfLocation
      });
      await copy.save();
      copies.push(copy);
    }

    // Populate the inventory for response
    await inventory.populate([
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' }
    ]);

    return res.status(201).json({
      success: true,
      message: 'Inventory created successfully',
      data: { 
        inventory,
        copiesCreated: copies.length
      }
    });

  } catch (error) {
    console.error('Create inventory error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to create inventory'
    });
  }
};

// Update inventory
export const updateInventory = async (req: Request, res: Response) => {
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
    const allowedUpdates = ['totalCopies', 'shelfLocation', 'notes'];
    
    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'Inventory not found'
      });
    }

    // If updating totalCopies, we need to handle copy creation/deletion
    if (updates.totalCopies !== undefined) {
      const currentTotal = inventory.totalCopies;
      const newTotal = updates.totalCopies;
      const difference = newTotal - currentTotal;

      if (difference > 0) {
        // Add new copies
        const newCopies = [];
        for (let i = 0; i < difference; i++) {
          const copy = new Copy({
            inventoryId: inventory._id,
            libraryId: inventory.libraryId,
            titleId: inventory.titleId,
            status: 'available',
            condition: 'good',
            shelfLocation: updates.shelfLocation || inventory.shelfLocation
          });
          await copy.save();
          newCopies.push(copy);
        }
      } else if (difference < 0) {
        // Remove excess copies (only available ones)
        const copiesToRemove = Math.abs(difference);
        const availableCopies = await Copy.find({
          inventoryId: inventory._id,
          status: 'available'
        }).limit(copiesToRemove);

        for (const copy of availableCopies) {
          await copy.deleteOne();
        }
      }

      // Update available copies count
      updates.availableCopies = await Copy.countDocuments({
        inventoryId: inventory._id,
        status: 'available'
      });
    }

    const updatedInventory = await Inventory.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    ).populate([
      { path: 'libraryId', select: 'name code' },
      { path: 'titleId', select: 'title authors isbn13 isbn10' }
    ]);

    return res.json({
      success: true,
      message: 'Inventory updated successfully',
      data: { inventory: updatedInventory }
    });

  } catch (error) {
    console.error('Update inventory error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update inventory'
    });
  }
};

// Delete inventory
export const deleteInventory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if inventory has any copies
    const copyCount = await Copy.countDocuments({ inventoryId: id });
    if (copyCount > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete inventory with existing copies'
      });
    }

    const inventory = await Inventory.findByIdAndDelete(id);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'Inventory not found'
      });
    }

    return res.json({
      success: true,
      message: 'Inventory deleted successfully'
    });

  } catch (error) {
    console.error('Delete inventory error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete inventory'
    });
  }
};

// Get available inventories for a library
export const getAvailableInventories = async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.params;

    const inventories = await Inventory.findAvailable(libraryId);

    return res.json({
      success: true,
      data: { inventories }
    });

  } catch (error) {
    console.error('Get available inventories error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get available inventories'
    });
  }
};

// Update copy counts for an inventory
export const updateCopyCounts = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const inventory = await Inventory.findById(id);
    if (!inventory) {
      return res.status(404).json({
        success: false,
        error: 'Inventory not found'
      });
    }

    const updatedInventory = await Inventory.updateCopyCounts(id);

    return res.json({
      success: true,
      message: 'Copy counts updated successfully',
      data: { inventory: updatedInventory }
    });

  } catch (error) {
    console.error('Update copy counts error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to update copy counts'
    });
  }
};
