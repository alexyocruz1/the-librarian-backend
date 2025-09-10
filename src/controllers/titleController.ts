import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { Title } from '@/models/Title';
import { Inventory } from '@/models/Inventory';
import { Copy } from '@/models/Copy';
import { BorrowRecord } from '@/models/BorrowRecord';
import { BorrowRequest } from '@/models/BorrowRequest';

// Validation rules
export const createTitleValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('authors')
    .isArray({ min: 1 })
    .withMessage('At least one author is required'),
  body('authors.*')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Author name must be between 1 and 100 characters'),
  body('isbn13')
    .optional()
    .matches(/^\d{13}$/)
    .withMessage('ISBN13 must be exactly 13 digits'),
  body('isbn10')
    .optional()
    .matches(/^\d{10}$/)
    .withMessage('ISBN10 must be exactly 10 digits'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subtitle cannot exceed 200 characters'),
  body('categories')
    .optional()
    .isArray()
    .withMessage('Categories must be an array'),
  body('categories.*')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category cannot exceed 50 characters'),
  body('language')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Language code cannot exceed 10 characters'),
  body('publisher')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Publisher name cannot exceed 100 characters'),
  body('publishedYear')
    .optional()
    .isInt({ min: 1000, max: new Date().getFullYear() + 1 })
    .withMessage('Published year must be a valid year'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('coverUrl')
    .optional()
    .isURL()
    .withMessage('Cover URL must be a valid URL')
];

export const updateTitleValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('authors')
    .optional()
    .isArray({ min: 1 })
    .withMessage('At least one author is required'),
  body('authors.*')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Author name must be between 1 and 100 characters'),
  body('isbn13')
    .optional()
    .matches(/^\d{13}$/)
    .withMessage('ISBN13 must be exactly 13 digits'),
  body('isbn10')
    .optional()
    .matches(/^\d{10}$/)
    .withMessage('ISBN10 must be exactly 10 digits'),
  body('subtitle')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Subtitle cannot exceed 200 characters'),
  body('categories')
    .optional()
    .isArray()
    .withMessage('Categories must be an array'),
  body('categories.*')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Category cannot exceed 50 characters'),
  body('language')
    .optional()
    .trim()
    .isLength({ max: 10 })
    .withMessage('Language code cannot exceed 10 characters'),
  body('publisher')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Publisher name cannot exceed 100 characters'),
  body('publishedYear')
    .optional()
    .isInt({ min: 1000, max: new Date().getFullYear() + 1 })
    .withMessage('Published year must be a valid year'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('Description cannot exceed 2000 characters'),
  body('coverUrl')
    .optional()
    .isURL()
    .withMessage('Cover URL must be a valid URL')
];

// Get all titles with search and pagination
export const getTitles = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = req.query.search as string;
    const author = req.query.author as string;
    const category = req.query.category as string;

    // Build query
    const query: any = {};
    
    if (search) {
      query.$text = { $search: search };
    }
    
    if (author) {
      query.authors = { $regex: author, $options: 'i' };
    }
    
    if (category) {
      query.categories = { $regex: category, $options: 'i' };
    }

    const skip = (page - 1) * limit;
    const sortOptions: any = search ? { score: { $meta: 'textScore' } } : { title: 1 };

    const [titles, total] = await Promise.all([
      Title.find(query, search ? { score: { $meta: 'textScore' } } : {})
        .sort(sortOptions)
        .skip(skip)
        .limit(limit),
      Title.countDocuments(query)
    ]);

    return res.json({
      success: true,
      data: { titles },
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Get titles error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get titles'
    });
  }
};

// Get title by ID
export const getTitleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const title = await Title.findById(id);
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }

    return res.json({
      success: true,
      data: { title }
    });

  } catch (error) {
    console.error('Get title error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get title'
    });
  }
};

// Create new title
export const createTitle = async (req: Request, res: Response) => {
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

    const titleData = req.body;

    // Check if ISBN already exists
    if (titleData.isbn13) {
      const existingTitle = await Title.findOne({ isbn13: titleData.isbn13 });
      if (existingTitle) {
        return res.status(409).json({
          success: false,
          error: 'Title with this ISBN13 already exists'
        });
      }
    }

    if (titleData.isbn10) {
      const existingTitle = await Title.findOne({ isbn10: titleData.isbn10 });
      if (existingTitle) {
        return res.status(409).json({
          success: false,
          error: 'Title with this ISBN10 already exists'
        });
      }
    }

    // Create new title
    const title = new Title(titleData);
    await title.save();

    return res.status(201).json({
      success: true,
      message: 'Title created successfully',
      data: { title }
    });

  } catch (error: any) {
    console.error('Create title error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `Title with this ${field} already exists`
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to create title'
    });
  }
};

// Update title
export const updateTitle = async (req: Request, res: Response) => {
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
    const allowedUpdates = [
      'title', 'subtitle', 'authors', 'categories', 'language', 
      'publisher', 'publishedYear', 'description', 'coverUrl'
    ];
    
    // Filter allowed updates
    const updates: any = {};
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    // Check ISBN uniqueness if updating
    if (updates.isbn13) {
      const existingTitle = await Title.findOne({ 
        isbn13: updates.isbn13,
        _id: { $ne: id }
      });
      if (existingTitle) {
        return res.status(409).json({
          success: false,
          error: 'Title with this ISBN13 already exists'
        });
      }
    }

    if (updates.isbn10) {
      const existingTitle = await Title.findOne({ 
        isbn10: updates.isbn10,
        _id: { $ne: id }
      });
      if (existingTitle) {
        return res.status(409).json({
          success: false,
          error: 'Title with this ISBN10 already exists'
        });
      }
    }

    const title = await Title.findByIdAndUpdate(
      id,
      updates,
      { new: true, runValidators: true }
    );

    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }

    return res.json({
      success: true,
      message: 'Title updated successfully',
      data: { title }
    });

  } catch (error: any) {
    console.error('Update title error:', error);
    
    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        error: `Title with this ${field} already exists`
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'Failed to update title'
    });
  }
};

// Delete title and all related data
export const deleteTitle = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if title exists
    const title = await Title.findById(id);
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }

    // Get all inventories for this title
    const inventories = await Inventory.find({ titleId: id });
    const inventoryIds = inventories.map(inv => inv._id);

    // Get all copies for these inventories
    const copies = await Copy.find({ inventoryId: { $in: inventoryIds } });
    const copyIds = copies.map(copy => copy._id);

    // Check if there are any active borrow records
    const activeBorrowRecords = await BorrowRecord.countDocuments({ 
      copyId: { $in: copyIds },
      status: { $in: ['borrowed', 'overdue'] }
    });

    if (activeBorrowRecords > 0) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete title with active borrow records. Please return all borrowed copies first.'
      });
    }

    // Delete all related data in the correct order
    // 1. Delete borrow records (both active and historical)
    await BorrowRecord.deleteMany({ copyId: { $in: copyIds } });
    
    // 2. Delete borrow requests
    await BorrowRequest.deleteMany({ titleId: id });
    
    // 3. Delete copies
    await Copy.deleteMany({ inventoryId: { $in: inventoryIds } });
    
    // 4. Delete inventories
    await Inventory.deleteMany({ titleId: id });
    
    // 5. Finally delete the title
    await Title.findByIdAndDelete(id);

    return res.json({
      success: true,
      message: 'Title deleted successfully'
    });

  } catch (error) {
    console.error('Delete title error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to delete title'
    });
  }
};

// Search titles
export const searchTitles = async (req: Request, res: Response) => {
  try {
    const { q, limit = 10 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Search query is required'
      });
    }

    const titles = await Title.searchTitles(q, parseInt(limit as string));

    return res.json({
      success: true,
      data: { titles }
    });

  } catch (error) {
    console.error('Search titles error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to search titles'
    });
  }
};

// Get title by ISBN
export const getTitleByISBN = async (req: Request, res: Response) => {
  try {
    const { isbn } = req.params;

    const title = await Title.findByISBN(isbn);
    if (!title) {
      return res.status(404).json({
        success: false,
        error: 'Title not found'
      });
    }

    return res.json({
      success: true,
      data: { title }
    });

  } catch (error) {
    console.error('Get title by ISBN error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get title by ISBN'
    });
  }
};
