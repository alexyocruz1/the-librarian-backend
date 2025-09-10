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
    const validationErrors = validationResult(req);
    if (!validationErrors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationErrors.array()
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
    const csvErrors: string[] = [];
    
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          // Validate required fields
          if (!row.title || !row.authors || !row.totalCopies) {
            csvErrors.push(`Row ${csvData.length + 1}: Missing required fields (title, authors, totalCopies)`);
            return;
          }

          // Validate ISBN formats
          if (row.isbn13 && !/^\d{13}$/.test(row.isbn13)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid ISBN13 format`);
            return;
          }

          if (row.isbn10 && !/^\d{10}$/.test(row.isbn10)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid ISBN10 format`);
            return;
          }

          // Validate totalCopies
          const totalCopies = parseInt(row.totalCopies);
          if (isNaN(totalCopies) || totalCopies < 1) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid totalCopies value`);
            return;
          }

          // Validate publishedYear
          if (row.publishedYear) {
            const year = parseInt(row.publishedYear);
            if (isNaN(year) || year < 1000 || year > new Date().getFullYear() + 1) {
              csvErrors.push(`Row ${csvData.length + 1}: Invalid publishedYear value`);
              return;
            }
          }

          // Validate coverUrl
          if (row.coverUrl && !/^https?:\/\/.+/.test(row.coverUrl)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid coverUrl format`);
            return;
          }

          csvData.push({
            // Book Information
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
            
            // Library Information
            libraryName: row.libraryName?.trim() || undefined,
            libraryCode: row.libraryCode?.trim() || undefined,
            
            // Individual Copy Information
            copyId: row.copyId?.trim() || undefined,
            barcode: row.barcode?.trim() || undefined,
            status: row.status?.trim() || 'available',
            condition: row.condition?.trim() || 'good',
            shelfLocation: row.shelfLocation?.trim() || undefined,
            acquiredAt: row.acquiredAt?.trim() || undefined,
            
            // Legacy fields for backward compatibility
            totalCopies: totalCopies,
            notes: row.notes?.trim() || undefined
          });
        })
        .on('end', resolve)
        .on('error', reject);
    });

    // If there are validation errors, return them
    if (csvErrors.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'CSV validation failed',
        details: csvErrors
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
      const copyData = csvData[i];
      
      try {
        // Find or create library
        let targetLibraryId = libraryId;
        if (copyData.libraryCode) {
          const library = await Library.findOne({ code: copyData.libraryCode });
          if (library) {
            targetLibraryId = (library._id as any).toString();
          } else {
            results.errors.push(`Row ${i + 1}: Library with code "${copyData.libraryCode}" not found`);
            continue;
          }
        }

        // Check if title already exists by ISBN
        let title = null;
        if (copyData.isbn13) {
          title = await Title.findOne({ isbn13: copyData.isbn13 });
        }
        if (!title && copyData.isbn10) {
          title = await Title.findOne({ isbn10: copyData.isbn10 });
        }

        // Create title if it doesn't exist
        if (!title) {
          title = new Title({
            isbn13: copyData.isbn13,
            isbn10: copyData.isbn10,
            title: copyData.title,
            subtitle: copyData.subtitle,
            authors: copyData.authors.split(',').map(author => author.trim()),
            categories: copyData.categories ? copyData.categories.split(',').map(cat => cat.trim()) : [],
            language: copyData.language,
            publisher: copyData.publisher,
            publishedYear: copyData.publishedYear,
            description: copyData.description,
            coverUrl: copyData.coverUrl
          });
          await title.save();
          results.titlesCreated++;
        } else {
          results.titlesSkipped++;
        }

        // Check if inventory already exists for this library and title
        let inventory = await Inventory.findOne({ libraryId: targetLibraryId, titleId: title._id });
        
        if (!inventory) {
          // Create inventory
          inventory = new Inventory({
            libraryId: targetLibraryId,
            titleId: title._id,
            totalCopies: 0,
            availableCopies: 0,
            shelfLocation: copyData.shelfLocation,
            notes: copyData.notes
          });
          await inventory.save();
          results.inventoriesCreated++;
        }

        // Check if copy already exists (by barcode)
        if (copyData.barcode) {
          const existingCopy = await Copy.findOne({ barcode: copyData.barcode });
          if (existingCopy) {
            results.errors.push(`Row ${i + 1}: Copy with barcode "${copyData.barcode}" already exists`);
            continue;
          }
        }

        // Create individual copy
        const copy = new Copy({
          inventoryId: inventory._id,
          libraryId: targetLibraryId,
          titleId: title._id,
          barcode: copyData.barcode || undefined,
          status: copyData.status || 'available',
          condition: copyData.condition || 'good',
          shelfLocation: copyData.shelfLocation || inventory.shelfLocation,
          acquiredAt: copyData.acquiredAt ? new Date(copyData.acquiredAt) : new Date()
        });
        await copy.save();
        results.copiesCreated++;

        // Update inventory counts
        inventory.totalCopies += 1;
        if (copyData.status === 'available') {
          inventory.availableCopies += 1;
        }
        await inventory.save();

      } catch (error) {
        results.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return res.json({
      success: true,
      message: 'CSV import completed',
      data: results
    });

  } catch (error) {
    console.error('Import books error:', error);
    return res.status(500).json({
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

    // Get all copies for the library with populated data
    const copies = await Copy.find({ libraryId })
      .populate('titleId')
      .populate('libraryId', 'name code')
      .populate('inventoryId');

    // Prepare CSV data with individual copy details
    const csvData = copies.map(copy => {
      const title = copy.titleId as any;
      const library = copy.libraryId as any;
      const inventory = copy.inventoryId as any;
      
      return {
        // Book Information
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
        
        // Library Information
        libraryName: library.name || '',
        libraryCode: library.code || '',
        
        // Individual Copy Information
        copyId: copy._id,
        barcode: copy.barcode || '',
        status: copy.status,
        condition: copy.condition,
        shelfLocation: copy.shelfLocation || inventory?.shelfLocation || '',
        acquiredAt: copy.acquiredAt ? new Date(copy.acquiredAt).toISOString().split('T')[0] : '',
        
        // Inventory Summary (for reference)
        inventoryTotalCopies: inventory?.totalCopies || 0,
        inventoryAvailableCopies: inventory?.availableCopies || 0,
        inventoryNotes: inventory?.notes || ''
      };
    });

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: 'temp-export.csv',
      header: [
        // Book Information
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
        
        // Library Information
        { id: 'libraryName', title: 'Library Name' },
        { id: 'libraryCode', title: 'Library Code' },
        
        // Individual Copy Information
        { id: 'copyId', title: 'Copy ID' },
        { id: 'barcode', title: 'Barcode' },
        { id: 'status', title: 'Status' },
        { id: 'condition', title: 'Condition' },
        { id: 'shelfLocation', title: 'Shelf Location' },
        { id: 'acquiredAt', title: 'Acquired Date' },
        
        // Inventory Summary (for reference)
        { id: 'inventoryTotalCopies', title: 'Inventory Total Copies' },
        { id: 'inventoryAvailableCopies', title: 'Inventory Available Copies' },
        { id: 'inventoryNotes', title: 'Inventory Notes' }
      ]
    });

    // Write CSV file
    await csvWriter.writeRecords(csvData);

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${library.code}-copies-export.csv"`);

    // Send the file
    const fs = require('fs');
    const fileStream = fs.createReadStream('temp-export.csv');
    fileStream.pipe(res);

    // Clean up temp file
    fileStream.on('end', () => {
      fs.unlinkSync('temp-export.csv');
    });
    
    return; // File stream handles the response

  } catch (error) {
    console.error('Export books error:', error);
    return res.status(500).json({
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
        // Book Information
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
        
        // Library Information
        libraryName: 'Main Library',
        libraryCode: 'ML-001',
        
        // Individual Copy Information
        copyId: 'copy_id_1',
        barcode: 'SAMPLE-001',
        status: 'available',
        condition: 'good',
        shelfLocation: 'Aisle 2, Rack 4',
        acquiredAt: '2023-01-15',
        
        // Inventory Summary (for reference)
        inventoryTotalCopies: '3',
        inventoryAvailableCopies: '2',
        inventoryNotes: 'Sample notes about the book'
      }
    ];

    // Create CSV writer
    const csvWriter = createObjectCsvWriter({
      path: 'temp-template.csv',
      header: [
        // Book Information
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
        
        // Library Information
        { id: 'libraryName', title: 'Library Name' },
        { id: 'libraryCode', title: 'Library Code' },
        
        // Individual Copy Information
        { id: 'copyId', title: 'Copy ID' },
        { id: 'barcode', title: 'Barcode' },
        { id: 'status', title: 'Status' },
        { id: 'condition', title: 'Condition' },
        { id: 'shelfLocation', title: 'Shelf Location' },
        { id: 'acquiredAt', title: 'Acquired Date' },
        
        // Inventory Summary (for reference)
        { id: 'inventoryTotalCopies', title: 'Inventory Total Copies' },
        { id: 'inventoryAvailableCopies', title: 'Inventory Available Copies' },
        { id: 'inventoryNotes', title: 'Inventory Notes' }
      ]
    });

    // Write template file
    await csvWriter.writeRecords(templateData);

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="copies-import-template.csv"');

    // Send the file
    const fs = require('fs');
    const fileStream = fs.createReadStream('temp-template.csv');
    fileStream.pipe(res);

    // Clean up temp file
    fileStream.on('end', () => {
      fs.unlinkSync('temp-template.csv');
    });
    
    return; // File stream handles the response

  } catch (error) {
    console.error('Get CSV template error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate CSV template'
    });
  }
};
