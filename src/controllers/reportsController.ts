import { Request, Response } from 'express';
import { User } from '@/models/User';
import { Library } from '@/models/Library';
import { Title } from '@/models/Title';
import { Inventory } from '@/models/Inventory';
import { Copy } from '@/models/Copy';
import { BorrowRequest } from '@/models/BorrowRequest';
import { BorrowRecord } from '@/models/BorrowRecord';

// Get comprehensive reports data
export const getReportsData = async (req: Request, res: Response) => {
  try {
    const { dateRange = '30' } = req.query;
    const days = parseInt(dateRange as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build library filter based on user role
    let libraryFilter: any = {};
    if (req.user?.role === 'admin' && req.user.libraries) {
      libraryFilter = { libraryId: { $in: req.user.libraries } };
    }

    // Get basic counts
    const [
      totalBooks,
      totalUsers,
      totalLibraries,
      totalInventories,
      totalCopies,
      activeLoans,
      overdueBooks,
      pendingRequests,
      totalBorrowRecords
    ] = await Promise.all([
      Title.countDocuments(),
      User.countDocuments({ status: 'active' }),
      Library.countDocuments(libraryFilter.libraryId ? libraryFilter : {}),
      Inventory.countDocuments(libraryFilter.libraryId ? libraryFilter : {}),
      Copy.countDocuments(libraryFilter.libraryId ? libraryFilter : {}),
      BorrowRecord.countDocuments({ 
        status: { $in: ['borrowed', 'overdue'] },
        ...(libraryFilter.libraryId && libraryFilter)
      }),
      BorrowRecord.countDocuments({ 
        status: { $in: ['borrowed', 'overdue'] },
        dueDate: { $lt: new Date() },
        ...(libraryFilter.libraryId && libraryFilter)
      }),
      BorrowRequest.countDocuments({ 
        status: 'pending',
        ...(libraryFilter.libraryId && libraryFilter)
      }),
      BorrowRecord.countDocuments(libraryFilter.libraryId ? libraryFilter : {})
    ]);

    // Get popular books (most borrowed)
    const popularBooksAggregation = await BorrowRecord.aggregate([
      {
        $match: {
          ...(libraryFilter.libraryId && { libraryId: libraryFilter }),
          borrowDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$titleId',
          borrowCount: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'titles',
          localField: '_id',
          foreignField: '_id',
          as: 'title'
        }
      },
      {
        $unwind: '$title'
      },
      {
        $project: {
          title: '$title.title',
          borrowCount: 1
        }
      },
      {
        $sort: { borrowCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Get recent activity
    const recentActivity = await BorrowRecord.aggregate([
      {
        $match: {
          ...(libraryFilter.libraryId && { libraryId: libraryFilter }),
          borrowDate: { $gte: startDate }
        }
      },
      {
        $lookup: {
          from: 'titles',
          localField: 'titleId',
          foreignField: '_id',
          as: 'title'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $lookup: {
          from: 'libraries',
          localField: 'libraryId',
          foreignField: '_id',
          as: 'library'
        }
      },
      {
        $unwind: '$title'
      },
      {
        $unwind: '$user'
      },
      {
        $unwind: '$library'
      },
      {
        $project: {
          type: {
            $cond: {
              if: { $eq: ['$status', 'returned'] },
              then: 'return',
              else: {
                $cond: {
                  if: { $lt: ['$dueDate', new Date()] },
                  then: 'overdue',
                  else: 'borrow'
                }
              }
            }
          },
          message: {
            $cond: {
              if: { $eq: ['$status', 'returned'] },
              then: {
                $concat: [
                  '$user.name',
                  ' returned "',
                  '$title.title',
                  '" to ',
                  '$library.name'
                ]
              },
              else: {
                $cond: {
                  if: { $lt: ['$dueDate', new Date()] },
                  then: {
                    $concat: [
                      '"',
                      '$title.title',
                      '" is overdue for ',
                      '$user.name'
                    ]
                  },
                  else: {
                    $concat: [
                      '$user.name',
                      ' borrowed "',
                      '$title.title',
                      '" from ',
                      '$library.name'
                    ]
                  }
                }
              }
            }
          },
          timestamp: '$borrowDate',
          user: '$user.name',
          book: '$title.title',
          library: '$library.name'
        }
      },
      {
        $sort: { timestamp: -1 }
      },
      {
        $limit: 20
      }
    ]);

    // Get borrow trends (daily borrows for the period)
    const borrowTrends = await BorrowRecord.aggregate([
      {
        $match: {
          ...(libraryFilter.libraryId && { libraryId: libraryFilter }),
          borrowDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$borrowDate'
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    // Get user activity stats
    const userActivityStats = await BorrowRecord.aggregate([
      {
        $match: {
          ...(libraryFilter.libraryId && { libraryId: libraryFilter }),
          borrowDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$userId',
          borrowCount: { $sum: 1 },
          lastActivity: { $max: '$borrowDate' }
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          name: '$user.name',
          email: '$user.email',
          role: '$user.role',
          borrowCount: 1,
          lastActivity: 1
        }
      },
      {
        $sort: { borrowCount: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Get library performance stats
    const libraryStats = await BorrowRecord.aggregate([
      {
        $match: {
          borrowDate: { $gte: startDate }
        }
      },
      {
        $group: {
          _id: '$libraryId',
          totalBorrows: { $sum: 1 },
          activeLoans: {
            $sum: {
              $cond: [
                { $in: ['$status', ['borrowed', 'overdue']] },
                1,
                0
              ]
            }
          },
          overdueCount: {
            $sum: {
              $cond: [
                { $lt: ['$dueDate', new Date()] },
                1,
                0
              ]
            }
          }
        }
      },
      {
        $lookup: {
          from: 'libraries',
          localField: '_id',
          foreignField: '_id',
          as: 'library'
        }
      },
      {
        $unwind: '$library'
      },
      {
        $project: {
          name: '$library.name',
          code: '$library.code',
          totalBorrows: 1,
          activeLoans: 1,
          overdueCount: 1,
          overdueRate: {
            $cond: {
              if: { $gt: ['$activeLoans', 0] },
              then: {
                $multiply: [
                  { $divide: ['$overdueCount', '$activeLoans'] },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      {
        $sort: { totalBorrows: -1 }
      }
    ]);

    // Calculate system health metrics
    const overdueRate = activeLoans > 0 ? (overdueBooks / activeLoans) * 100 : 0;
    const requestProcessingRate = pendingRequests > 50 ? 'High' : 'Normal';
    const systemHealth = overdueRate < 10 && pendingRequests < 50 ? 'Healthy' : 'Warning';

    const reportsData = {
      summary: {
        totalBooks,
        totalUsers,
        totalLibraries,
        totalInventories,
        totalCopies,
        activeLoans,
        overdueBooks,
        pendingRequests,
        totalBorrows: totalBorrowRecords,
        dateRange: days
      },
      popularBooks: popularBooksAggregation,
      recentActivity,
      borrowTrends,
      userActivityStats,
      libraryStats,
      systemHealth: {
        overdueRate: Math.round(overdueRate * 10) / 10,
        requestProcessingRate,
        systemStatus: systemHealth,
        lastUpdated: new Date()
      }
    };

    return res.json({
      success: true,
      data: reportsData
    });

  } catch (error) {
    console.error('Get reports data error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get reports data'
    });
  }
};

// Get specific report data
export const getReportData = async (req: Request, res: Response) => {
  try {
    const { type } = req.params;
    const { dateRange = '30' } = req.query;
    const days = parseInt(dateRange as string);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Build library filter based on user role
    let libraryFilter: any = {};
    if (req.user?.role === 'admin' && req.user.libraries) {
      libraryFilter = { libraryId: { $in: req.user.libraries } };
    }

    let data: any = {};

    switch (type) {
      case 'books':
        data = await getBooksReport(libraryFilter, startDate);
        break;
      case 'users':
        data = await getUsersReport(libraryFilter, startDate);
        break;
      case 'loans':
        data = await getLoansReport(libraryFilter, startDate);
        break;
      case 'libraries':
        data = await getLibrariesReport(libraryFilter, startDate);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid report type'
        });
    }

    return res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('Get report data error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to get report data'
    });
  }
};

// Helper functions for specific reports
async function getBooksReport(libraryFilter: any, startDate: Date) {
  const books = await Title.aggregate([
    {
      $lookup: {
        from: 'inventories',
        localField: '_id',
        foreignField: 'titleId',
        as: 'inventories'
      }
    },
    {
      $lookup: {
        from: 'borrowrecords',
        localField: '_id',
        foreignField: 'titleId',
        as: 'borrowRecords'
      }
    },
    {
      $project: {
        title: 1,
        authors: 1,
        isbn13: 1,
        isbn10: 1,
        categories: 1,
        publisher: 1,
        publishedYear: 1,
        totalCopies: {
          $sum: '$inventories.totalCopies'
        },
        availableCopies: {
          $sum: '$inventories.availableCopies'
        },
        totalBorrows: {
          $size: '$borrowRecords'
        },
        recentBorrows: {
          $size: {
            $filter: {
              input: '$borrowRecords',
              cond: { $gte: ['$$this.borrowDate', startDate] }
            }
          }
        }
      }
    },
    {
      $sort: { totalBorrows: -1 }
    }
  ]);

  return { books };
}

async function getUsersReport(libraryFilter: any, startDate: Date) {
  const users = await User.aggregate([
    {
      $lookup: {
        from: 'borrowrecords',
        localField: '_id',
        foreignField: 'userId',
        as: 'borrowRecords'
      }
    },
    {
      $project: {
        name: 1,
        email: 1,
        role: 1,
        status: 1,
        createdAt: 1,
        lastLoginAt: 1,
        totalBorrows: {
          $size: '$borrowRecords'
        },
        activeLoans: {
          $size: {
            $filter: {
              input: '$borrowRecords',
              cond: { $in: ['$$this.status', ['borrowed', 'overdue']] }
            }
          }
        },
        recentActivity: {
          $size: {
            $filter: {
              input: '$borrowRecords',
              cond: { $gte: ['$$this.borrowDate', startDate] }
            }
          }
        }
      }
    },
    {
      $sort: { totalBorrows: -1 }
    }
  ]);

  return { users };
}

async function getLoansReport(libraryFilter: any, startDate: Date) {
  const loans = await BorrowRecord.aggregate([
    {
      $match: {
        ...(libraryFilter.libraryId && { libraryId: libraryFilter }),
        borrowDate: { $gte: startDate }
      }
    },
    {
      $lookup: {
        from: 'titles',
        localField: 'titleId',
        foreignField: '_id',
        as: 'title'
      }
    },
    {
      $lookup: {
        from: 'users',
        localField: 'userId',
        foreignField: '_id',
        as: 'user'
      }
    },
    {
      $lookup: {
        from: 'libraries',
        localField: 'libraryId',
        foreignField: '_id',
        as: 'library'
      }
    },
    {
      $unwind: '$title'
    },
    {
      $unwind: '$user'
    },
    {
      $unwind: '$library'
    },
    {
      $project: {
        title: '$title.title',
        user: '$user.name',
        library: '$library.name',
        borrowDate: 1,
        dueDate: 1,
        returnDate: 1,
        status: 1,
        isOverdue: {
          $and: [
            { $in: ['$status', ['borrowed', 'overdue']] },
            { $lt: ['$dueDate', new Date()] }
          ]
        }
      }
    },
    {
      $sort: { borrowDate: -1 }
    }
  ]);

  return { loans };
}

async function getLibrariesReport(libraryFilter: any, startDate: Date) {
  const libraries = await Library.aggregate([
    {
      $lookup: {
        from: 'inventories',
        localField: '_id',
        foreignField: 'libraryId',
        as: 'inventories'
      }
    },
    {
      $lookup: {
        from: 'borrowrecords',
        localField: '_id',
        foreignField: 'libraryId',
        as: 'borrowRecords'
      }
    },
    {
      $project: {
        name: 1,
        code: 1,
        location: 1,
        contact: 1,
        totalBooks: {
          $sum: '$inventories.totalCopies'
        },
        availableBooks: {
          $sum: '$inventories.availableCopies'
        },
        totalBorrows: {
          $size: '$borrowRecords'
        },
        activeLoans: {
          $size: {
            $filter: {
              input: '$borrowRecords',
              cond: { $in: ['$$this.status', ['borrowed', 'overdue']] }
            }
          }
        },
        recentActivity: {
          $size: {
            $filter: {
              input: '$borrowRecords',
              cond: { $gte: ['$$this.borrowDate', startDate] }
            }
          }
        }
      }
    },
    {
      $sort: { totalBorrows: -1 }
    }
  ]);

  return { libraries };
}
