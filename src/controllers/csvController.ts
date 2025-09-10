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

// Helper function to parse various date formats
const parseDate = (dateString: string): Date => {
  if (!dateString) return new Date();
  
  // Handle DD/MM/YY format (e.g., "15/01/23", "10/01/24")
  if (dateString.includes('/')) {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1; // JavaScript months are 0-based
      let year = parseInt(parts[2]);
      
      // Handle 2-digit years
      if (year < 100) {
        year += year < 50 ? 2000 : 1900;
      }
      
      return new Date(year, month, day);
    }
  }
  
  // Handle YYYY-MM-DD format
  if (dateString.includes('-')) {
    return new Date(dateString);
  }
  
  // Fallback to default Date parsing
  const parsed = new Date(dateString);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

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
  // No body validation needed - library info comes from CSV file
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

    // Library information comes from CSV file, not request body

    // Parse CSV file
    const csvData: CSVBookData[] = [];
    const csvErrors: string[] = [];
    
    const stream = Readable.from(req.file.buffer.toString());
    
    await new Promise((resolve, reject) => {
      stream
        .pipe(csv())
        .on('data', (row) => {
          // Normalize field names (handle case variations)
          const normalizedRow = {
            isbn13: row.ISBN13 || row.isbn13,
            isbn10: row.ISBN10 || row.isbn10,
            title: row.Title || row.title,
            subtitle: row.Subtitle || row.subtitle,
            authors: row.Authors || row.authors,
            categories: row.Categories || row.categories,
            language: row.Language || row.language,
            publisher: row.Publisher || row.publisher,
            publishedYear: row['Published Year'] || row.publishedYear,
            description: row.Description || row.description,
            coverUrl: row['Cover URL'] || row.coverUrl,
            libraryCode: row['Library Code'] || row.libraryCode,
            barcode: row.Barcode || row.barcode,
            status: row.Status || row.status,
            condition: row.Condition || row.condition,
            shelfLocation: row['Shelf Location'] || row.shelfLocation,
            acquiredAt: row['Acquired Date'] || row.acquiredAt,
            totalCopies: row['Total Copies'] || row.totalCopies,
            inventoryNotes: row['Inventory Notes'] || row.inventoryNotes
          };
          
          // Validate required fields
          if (!normalizedRow.title || !normalizedRow.authors || !normalizedRow.totalCopies) {
            csvErrors.push(`Row ${csvData.length + 1}: Missing required fields (title, authors, totalCopies)`);
            return;
          }

          // Validate ISBN formats
          if (normalizedRow.isbn13) {
            // Handle scientific notation (e.g., 9.78123E+12)
            let isbn13 = normalizedRow.isbn13;
            if (isbn13.includes('E+') || isbn13.includes('e+')) {
              isbn13 = parseFloat(isbn13).toFixed(0);
            }
            if (!/^\d{13}$/.test(isbn13)) {
              csvErrors.push(`Row ${csvData.length + 1}: Invalid ISBN13 format`);
              return;
            }
            // Update the normalized row with the corrected ISBN13
            normalizedRow.isbn13 = isbn13;
          }

          if (normalizedRow.isbn10 && !/^\d{10}$/.test(normalizedRow.isbn10)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid ISBN10 format`);
            return;
          }

          // Validate totalCopies
          const totalCopies = parseInt(normalizedRow.totalCopies);
          if (isNaN(totalCopies) || totalCopies < 1) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid totalCopies value`);
            return;
          }

          // Validate publishedYear
          if (normalizedRow.publishedYear) {
            const year = parseInt(normalizedRow.publishedYear);
            if (isNaN(year) || year < 1000 || year > new Date().getFullYear() + 1) {
              csvErrors.push(`Row ${csvData.length + 1}: Invalid publishedYear value`);
              return;
            }
          }

          // Validate coverUrl
          if (normalizedRow.coverUrl && !/^https?:\/\/.+/.test(normalizedRow.coverUrl)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid coverUrl format`);
            return;
          }

          // Validate status
          if (normalizedRow.status && !['available', 'borrowed', 'reserved', 'lost', 'maintenance'].includes(normalizedRow.status)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid status value`);
            return;
          }

          // Validate condition
          if (normalizedRow.condition && !['new', 'good', 'used', 'worn', 'damaged'].includes(normalizedRow.condition)) {
            csvErrors.push(`Row ${csvData.length + 1}: Invalid condition value. Valid values are: new, good, used, worn, damaged`);
            return;
          }

          // Validate libraryCode
          if (!normalizedRow.libraryCode) {
            csvErrors.push(`Row ${csvData.length + 1}: Library code is required`);
            return;
          }

          csvData.push({
            // Book Information
            isbn13: normalizedRow.isbn13 || undefined,
            isbn10: normalizedRow.isbn10 || undefined,
            title: normalizedRow.title.trim(),
            subtitle: normalizedRow.subtitle?.trim() || undefined,
            authors: normalizedRow.authors.trim(),
            categories: normalizedRow.categories?.trim() || undefined,
            language: normalizedRow.language?.trim() || 'en',
            publisher: normalizedRow.publisher?.trim() || undefined,
            publishedYear: normalizedRow.publishedYear ? parseInt(normalizedRow.publishedYear) : undefined,
            description: normalizedRow.description?.trim() || undefined,
            coverUrl: normalizedRow.coverUrl?.trim() || undefined,
            
            // Library Information
            libraryCode: normalizedRow.libraryCode?.trim() || undefined,
            
            // Individual Copy Information
            barcode: normalizedRow.barcode?.trim() || undefined,
            status: normalizedRow.status?.trim() || 'available',
            condition: normalizedRow.condition?.trim() || 'good',
            shelfLocation: normalizedRow.shelfLocation?.trim() || undefined,
            acquiredAt: normalizedRow.acquiredAt?.trim() || undefined,
            
            // Legacy fields for backward compatibility
            totalCopies: totalCopies,
            notes: normalizedRow.inventoryNotes?.trim() || undefined
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
        // Find library by code from CSV
        if (!copyData.libraryCode) {
          results.errors.push(`Row ${i + 1}: Library code is required`);
          continue;
        }
        
        const library = await Library.findOne({ code: copyData.libraryCode });
        if (!library) {
          results.errors.push(`Row ${i + 1}: Library with code "${copyData.libraryCode}" not found`);
          continue;
        }
        
        const targetLibraryId = (library._id as any).toString();

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

        // Determine how many copies to create
        const copiesToCreate = copyData.totalCopies || 1;
        
        // Create multiple copies if totalCopies > 1
        for (let copyIndex = 0; copyIndex < copiesToCreate; copyIndex++) {
          let barcode = copyData.barcode;
          
          // If multiple copies and custom barcode provided, append sequence number
          if (copiesToCreate > 1 && copyData.barcode && copyData.barcode.trim()) {
            barcode = `${copyData.barcode}-${String(copyIndex + 1).padStart(3, '0')}`;
          }
          
          // Check if copy already exists (by barcode) - only if barcode is not empty
          if (barcode && barcode.trim()) {
            const existingCopy = await Copy.findOne({ barcode: barcode });
            if (existingCopy) {
              results.errors.push(`Row ${i + 1}, Copy ${copyIndex + 1}: Copy with barcode "${barcode}" already exists - skipping`);
              continue;
            }
          }

          try {
            // Create individual copy
            const copy = new Copy({
              inventoryId: inventory._id,
              libraryId: targetLibraryId,
              titleId: title._id,
              barcode: (barcode && barcode.trim()) ? barcode : undefined,
              status: copyData.status || 'available',
              condition: copyData.condition || 'good',
              shelfLocation: copyData.shelfLocation || inventory.shelfLocation,
              acquiredAt: copyData.acquiredAt ? parseDate(copyData.acquiredAt) : new Date()
            });
            await copy.save();
            results.copiesCreated++;

            // Update inventory counts
            inventory.totalCopies += 1;
            if (copyData.status === 'available') {
              inventory.availableCopies += 1;
            }
          } catch (error: any) {
            if (error.code === 11000) {
              // Duplicate key error
              results.errors.push(`Row ${i + 1}, Copy ${copyIndex + 1}: Copy with barcode "${barcode}" already exists - skipping`);
            } else {
              results.errors.push(`Row ${i + 1}, Copy ${copyIndex + 1}: ${error.message}`);
            }
          }
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

    let copies;
    let libraryName = 'All Libraries';
    let libraryCode = 'ALL';

    if (libraryId) {
      // Check if library exists
      const library = await Library.findById(libraryId);
      if (!library) {
        return res.status(404).json({
          success: false,
          error: 'Library not found'
        });
      }
      libraryName = library.name;
      libraryCode = library.code;

      // Get all copies for the specific library
      copies = await Copy.find({ libraryId })
        .populate('titleId')
        .populate('libraryId', 'name code')
        .populate('inventoryId');
    } else {
      // Get all copies from all libraries
      copies = await Copy.find({})
        .populate('titleId')
        .populate('libraryId', 'name code')
        .populate('inventoryId');
    }

    // Prepare CSV data with individual copy details
    const csvData = copies.map(copy => {
      const title = copy.titleId as any;
      const library = copy.libraryId as any;
      const inventory = copy.inventoryId as any;
      
      return {
        // Book Information
        isbn13: title?.isbn13 || '',
        isbn10: title?.isbn10 || '',
        title: title?.title || 'Unknown Title',
        subtitle: title?.subtitle || '',
        authors: title?.authors ? (Array.isArray(title.authors) ? title.authors.join(', ') : title.authors) : '',
        categories: title?.categories ? (Array.isArray(title.categories) ? title.categories.join(', ') : title.categories) : '',
        language: title?.language || 'en',
        publisher: title?.publisher || '',
        publishedYear: title?.publishedYear || '',
        description: title?.description || '',
        coverUrl: title?.coverUrl || '',
        
        // Library Information
        libraryCode: library?.code || 'UNK',
        
        // Individual Copy Information
        barcode: copy.barcode || '',
        status: copy.status || 'available',
        condition: copy.condition || 'good',
        shelfLocation: copy.shelfLocation || inventory?.shelfLocation || '',
        acquiredAt: copy.acquiredAt ? new Date(copy.acquiredAt).toISOString().split('T')[0] : '',
        totalCopies: 1, // Each row represents one copy
        
        // Inventory Summary (for reference)
        inventoryNotes: inventory?.notes || ''
      };
    });

    // Debug: Log CSV data before writing
    console.log('CSV Data to write:', JSON.stringify(csvData[0], null, 2));
    console.log('Number of records:', csvData.length);

    // Create CSV manually to test
    const headers = [
      'ISBN13', 'ISBN10', 'Title', 'Subtitle', 'Authors', 'Categories', 'Language', 'Publisher', 
      'Published Year', 'Description', 'Cover URL', 'Library Code', 
      'Barcode', 'Status', 'Condition', 'Shelf Location', 'Acquired Date', 'Total Copies',
      'Inventory Notes'
    ];
    
    const csvRows = [headers.join(',')];
    
    csvData.forEach(row => {
      const csvRow = [
        `"${row.isbn13 || ''}"`,
        `"${row.isbn10 || ''}"`,
        `"${row.title || ''}"`,
        `"${row.subtitle || ''}"`,
        `"${row.authors || ''}"`,
        `"${row.categories || ''}"`,
        `"${row.language || ''}"`,
        `"${row.publisher || ''}"`,
        `"${row.publishedYear || ''}"`,
        `"${row.description || ''}"`,
        `"${row.coverUrl || ''}"`,
        `"${row.libraryCode || ''}"`,
        `"${row.barcode || ''}"`,
        `"${row.status || ''}"`,
        `"${row.condition || ''}"`,
        `"${row.shelfLocation || ''}"`,
        `"${row.acquiredAt || ''}"`,
        `"${row.totalCopies || ''}"`,
        `"${row.inventoryNotes || ''}"`
      ];
      csvRows.push(csvRow.join(','));
    });
    
    const csvContent = csvRows.join('\n');
    console.log('Manual CSV content (first 500 chars):', csvContent.substring(0, 500));
    
    // Write CSV file manually
    const fs = require('fs');
    fs.writeFileSync('temp-export.csv', csvContent, 'utf8');

    // Debug: Check if file was created and read its content
    if (fs.existsSync('temp-export.csv')) {
      const fileContent = fs.readFileSync('temp-export.csv', 'utf8');
      console.log('CSV file content (first 500 chars):', fileContent.substring(0, 500));
    } else {
      console.log('CSV file was not created!');
    }

    // Set response headers for file download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${libraryCode}-copies-export.csv"`);

    // Send the file
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
        coverUrl: 'https://via.placeholder.com/300x400/cccccc/666666?text=Sample+Book',
        
        // Library Information
        libraryCode: 'ML-001',
        
        // Individual Copy Information
        barcode: 'CUSTOM-001',
        status: 'available',
        condition: 'good',
        shelfLocation: 'Aisle 2, Rack 4',
        acquiredAt: '2023-01-15',
        totalCopies: '3',
        
        // Inventory Summary (for reference)
        inventoryNotes: 'Sample notes about the book'
      },
      {
        // Book Information
        isbn13: '9780987654321',
        isbn10: '0987654321',
        title: 'Another Sample Book',
        subtitle: 'With Auto-Generated Barcodes',
        authors: 'Jane Smith',
        categories: 'Science, Technology',
        language: 'en',
        publisher: 'Tech Publisher',
        publishedYear: '2024',
        description: 'Another sample book for testing.',
        coverUrl: 'https://via.placeholder.com/300x400/cccccc/666666?text=Another+Book',
        
        // Library Information
        libraryCode: 'ML-001',
        
        // Individual Copy Information (empty barcode for auto-generation)
        barcode: '',
        status: 'available',
        condition: 'new',
        shelfLocation: 'Aisle 1, Rack 2',
        acquiredAt: '2024-01-10',
        totalCopies: '2',
        
        // Inventory Summary (for reference)
        inventoryNotes: 'New acquisition'
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
        { id: 'libraryCode', title: 'Library Code' },
        
        // Individual Copy Information
        { id: 'barcode', title: 'Barcode' },
        { id: 'status', title: 'Status' },
        { id: 'condition', title: 'Condition' },
        { id: 'shelfLocation', title: 'Shelf Location' },
        { id: 'acquiredAt', title: 'Acquired Date' },
        { id: 'totalCopies', title: 'Total Copies' },
        
        // Inventory Summary (for reference)
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
