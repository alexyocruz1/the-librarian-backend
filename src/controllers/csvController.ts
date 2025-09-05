import { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import csv from 'csv-parser';
import { createObjectCsvWriter } from 'csv-writer';
import { Readable } from 'stream';
import { Title } from '@/models/Title';
import { Inventory } from '@/models/Inventory';
import { Copy } from '@/models/Copy';
import { Library } from '@/models/Library';
import { CSVBookData } from '@/types';

// Configure multer for CSV upload
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

// Validation rules
export const importBooksValidation = [
  body('libraryId')
    .isMongoId()
    .withMessage('Valid library ID is required')
];

// Import books from CSV
export const importBooks = async (req: Request, res: Response) => {
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

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'CSV file is required'
      });
    }

    const { libraryId } = req.body;

    // Check if library exists
    const library = await Library.findById(libraryId);
    if (!library) {
      return res.status(404).json({
        success: false,
        error: 'Library not found'
      });
    }

    // Parse CSV file
    const csvData: CSVBookData[] = [];
    const errors: string[] = [];
    
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          // Validate required fields
          if (!row.title || !row.authors || !row.totalCopies) {
            errors.push(`Row ${csvData.length + 1}: Missing required fields (title, authors, totalCopies)`);
            return;
          }

          // Validate ISBN formats
          if (row.isbn13 && !/^\d{13}$/.test(row.isbn13)) {
            errors.push(`Row ${csvData.length + 1}: Invalid ISBN13 format`);
            return;
          }

          if (row.isbn10 && !/^\d{10}$/.test(row.isbn10)) {
            errors.push(`Row ${csvData.length + 1}: Invalid ISBN10 format`);
            return;
          }

          // Validate totalCopies
          const totalCopies = parseInt(row.totalCopies);
          if (isNaN(totalCopies) || totalCopies < 1) {
            errors.push(`Row ${csvData.length + 1}: Invalid totalCopies value`);
            return;
          }

          // Validate publishedYear
          if (row.publishedYear) {
            const year = parseInt(row.publishedYear);
            if (isNaN(year) || year < 1000 || year > new Date().getFullYear() + 1) {
              errors.push(`Row ${csvData.length + 1}: Invalid publishedYear value`);
              return;
            }
          }

          // Validate coverUrl
          if (row.coverUrl && !/^https?:\/\/.+/.test(row.coverUrl)) {
            errors.push(`Row ${csvData.length + 1}: Invalid coverUrl format`);
            return;
          }

          csvData.push({
            isbn13: row.isbn13 || undefined,
            isbn10: row.isbn10 || undefined,
            title: row.title.trim(),
            subtitle: row.subtitle?.trim() || undefined,
            authors: row.authors.trim(),
            categories: row.categories?.trim() || undefined,
            language: row.language?.trim() || 'en',
            publisher: row.publisher?.trim() || undefined,
            publishedYear: row.publishedYear ? parseInt(row.publishedYear) : undefined,
            description: row.description?.trim() || undefined,
            coverUrl: row.coverUrl?.trim() || undefined,
            totalCopies: totalCopies,
            shelfLocation: row.shelfLocation?.trim() || undefined,
            notes: row.notes?.trim() || undefined
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // If there are validation errors, return them
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV validation failed',
        details: errors
      });
    }

    // Process the data
    const results = {
      titlesCreated: 0,
      titlesSkipped: 0,
      inventoriesCreated: 0,
      copiesCreated: 0,
      errors: [] as string[]
    };

    for (let i = 0; i < csvData.length; i++) {
      const bookData = csvData[i];
      
      try {
        // Check if title already exists by ISBN
        let title = null;
        if (bookData.isbn13) {
          title = await Title.findOne({ isbn13: bookData.isbn13 });
        }
        if (!title && bookData.isbn10) {
          title = await Title.findOne({ isbn10: bookData.isbn10 });
        }

        // Create title if it doesn't exist
        if (!title) {
          title = new Title({
            isbn13: bookData.isbn13,
            isbn10: bookData.isbn10,
            title: bookData.title,
            subtitle: bookData.subtitle,
            authors: bookData.authors.split(',').map(author => author.trim()),
            categories: bookData.categories ? bookData.categories.split(',').map(cat => cat.trim()) : [],
            language: bookData.language,
            publisher: bookData.publisher,
            publishedYear: bookData.publishedYear,
            description: bookData.description,
            coverUrl: bookData.coverUrl
          });
          await title.save();
          results.titlesCreated++;
        } else {
          results.titlesSkipped++;
        }

        // Check if inventory already exists for this library and title
        let inventory = await Inventory.findOne({ libraryId, titleId: title._id });
        
        if (!inventory) {
          // Create inventory
          inventory = new Inventory({
            libraryId,
            titleId: title._id,
            totalCopies: bookData.totalCopies,
            availableCopies: bookData.totalCopies,
            shelfLocation: bookData.shelfLocation,
            notes: bookData.notes
          });
          await inventory.save();
          results.inventoriesCreated++;

          // Create copies
          for (let j = 0; j < bookData.totalCopies; j++) {
            const copy = new Copy({
              inventoryId: inventory._id,
              libraryId,
              titleId: title._id,
              status: 'available',
              condition: 'good',
              shelfLocation: bookData.shelfLocation || inventory.shelfLocation
            });
            await copy.save();
            results.copiesCreated++;
          }
        } else {
          // Update existing inventory
          inventory.totalCopies += bookData.totalCopies;
          inventory.availableCopies += bookData.totalCopies;
          await inventory.save();

          // Create additional copies
          for (let j = 0; j < bookData.totalCopies; j++) {
            const copy = new Copy({
              inventoryId: inventory._id,
              libraryId,
              titleId: title._id,
              status: 'available',
              condition: 'good',
              shelfLocation: bookData.shelfLocation || inventory.shelfLocation
            });
            await copy.save();
            results.copiesCreated++;
          }
        }

      } catch (error) {
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    res.json({
      success: true,
      message: 'CSV import completed',
      data: results
    });

  } catch (error) {
    console.error('Import books error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import books from CSV'
    });
  }
};

// Export books to CSV
export const exportBooks = async (req: Request, res: Response) => {
  try {
    const { libraryId } = req.query;

    if (!libraryId) {
      return res.status(400).json({
        success: false,
        error: 'Library ID is required'
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

    // Get all inventories for the library
    const inventories = await Inventory.find({ libraryId })
      .populate('titleId')
      .populate('libraryId', 'name code');

    // Prepare CSV data
    const csvData = inventories.map(inventory => {
      const title = inventory.titleId as any;
      return {
        isbn13: title.isbn13 || '',
        isbn10: title.isbn10 || '',
        title: title.title,
        subtitle: title.subtitle || '',
        authors: title.authors.join(', '),
        categories: title.categories ? title.categories.join(', ') : '',
        language: title.language || 'en',
        publisher: title.publisher || '',
        publishedYear: title.publishedYear || '',
        description: title.description || '',
        coverUrl: title.coverUrl || '',
        totalCopies: inventory.totalCopies,
        availableCopies: inventory.availableCopies,
        shelfLocation: inventory.shelfLocation || '',
        notes: inventory.notes || ''
      };
    });

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: 'temp-export.csv',
      header: [
        { id: 'isbn13', title: 'ISBN13' },
        { id: 'isbn10', title: 'ISBN10' },
        { id: 'title', title: 'Title' },
        { id: 'subtitle', title: 'Subtitle' },
        { id: 'authors', title: 'Authors' },
        { id: 'categories', title: 'Categories' },
        { id: 'language', title: 'Language' },
        { id: 'publisher', title: 'Publisher' },
        { id: 'publishedYear', title: 'Published Year' },
        { id: 'description', title: 'Description' },
        { id: 'coverUrl', title: 'Cover URL' },
        { id: 'totalCopies', title: 'Total Copies' },
        { id: 'availableCopies', title: 'Available Copies' },
        { id: 'shelfLocation', title: 'Shelf Location' },
        { id: 'notes', title: 'Notes' }
      ]
    });

    // Write CSV file
    await csvWriter.writeRecords(csvData);

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${library.code}-books-export.csv"`);

    // Send the file
    const fs = require('fs');
    const fileStream = fs.createReadStream('temp-export.csv');
    fileStream.pipe(res);

    // Clean up temp file
    fileStream.on('end', () => {
      fs.unlinkSync('temp-export.csv');
    });

  } catch (error) {
    console.error('Export books error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export books to CSV'
    });
  }
};

// Get CSV template
export const getCSVTemplate = async (req: Request, res: Response) => {
  try {
    // Create sample data for template
    const templateData = [
      {
        isbn13: '9781234567890',
        isbn10: '1234567890',
        title: 'Sample Book Title',
        subtitle: 'A Sample Subtitle',
        authors: 'Author One, Author Two',
        categories: 'Fiction, Adventure',
        language: 'en',
        publisher: 'Sample Publisher',
        publishedYear: '2023',
        description: 'This is a sample book description.',
        coverUrl: 'https://example.com/cover.jpg',
        totalCopies: '3',
        shelfLocation: 'Aisle 2, Rack 4',
        notes: 'Sample notes about the book'
      }
    ];

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: 'temp-template.csv',
      header: [
        { id: 'isbn13', title: 'ISBN13' },
        { id: 'isbn10', title: 'ISBN10' },
        { id: 'title', title: 'Title' },
        { id: 'subtitle', title: 'Subtitle' },
        { id: 'authors', title: 'Authors' },
        { id: 'categories', title: 'Categories' },
        { id: 'language', title: 'Language' },
        { id: 'publisher', title: 'Publisher' },
        { id: 'publishedYear', title: 'Published Year' },
        { id: 'description', title: 'Description' },
        { id: 'coverUrl', title: 'Cover URL' },
        { id: 'totalCopies', title: 'Total Copies' },
        { id: 'shelfLocation', title: 'Shelf Location' },
        { id: 'notes', title: 'Notes' }
      ]
    });

    // Write template file
    await csvWriter.writeRecords(templateData);

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="books-import-template.csv"');

    // Send the file
    const fs = require('fs');
    const fileStream = fs.createReadStream('temp-template.csv');
    fileStream.pipe(res);

    // Clean up temp file
    fileStream.on('end', () => {
      fs.unlinkSync('temp-template.csv');
    });

  } catch (error) {
    console.error('Get CSV template error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate CSV template'
    });
  }
};
