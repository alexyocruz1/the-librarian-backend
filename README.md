# The Librarian Backend

Library Management System Backend API built with Express.js, TypeScript, and MongoDB.

## 🚀 Features

- **Authentication & Authorization**: JWT-based auth with refresh tokens
- **Role-based Access Control**: Super Admin, Admin, Student, Guest roles
- **Multi-library Support**: Manage multiple library branches
- **User Management**: Create, update, approve users
- **Library Management**: CRUD operations for libraries
- **Book Management**: Titles, inventories, and copies tracking
- **Borrow System**: Request and approval workflow
- **CSV Import/Export**: Bulk book management
- **Barcode System**: Auto-generated barcodes with print functionality

## 🛠️ Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Language**: TypeScript
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: JWT + bcrypt
- **Validation**: express-validator
- **Security**: Helmet, CORS, Rate limiting

## 📋 Prerequisites

- Node.js 18 or higher
- MongoDB Atlas account (or local MongoDB)
- npm or yarn package manager

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd the-librarian-backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Setup**
   ```bash
   cp env.example .env
   ```
   
   Update the `.env` file with your configuration:
   ```env
   # Database
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/
   DB_NAME_DEV=library-test
   DB_NAME_PROD=library-prod
   
   # JWT Secrets (generate secure random strings)
   JWT_SECRET=your-super-secret-jwt-key-here
   JWT_REFRESH_SECRET=your-super-secret-refresh-key-here
   
   # Server
   PORT=5000
   NODE_ENV=development
   FRONTEND_URL=http://localhost:3000
   ```

4. **Setup Super Admin**
   ```bash
   npm run setup
   ```
   
   Follow the interactive prompts to create the initial super admin user.

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm run build
npm start
```

The server will start on `http://localhost:5000` (or the port specified in your `.env` file).

## 📚 API Documentation

### Base URL
```
http://localhost:5000/api/v1
```

### Authentication Endpoints
- `POST /auth/register` - Register new user
- `POST /auth/login` - Login user
- `POST /auth/refresh` - Refresh access token
- `POST /auth/logout` - Logout user
- `GET /auth/profile` - Get user profile
- `PUT /auth/profile` - Update user profile
- `PUT /auth/change-password` - Change password

### User Management Endpoints
- `GET /users` - Get all users (admin/super admin)
- `GET /users/pending` - Get pending students
- `GET /users/:id` - Get user by ID
- `POST /users` - Create new user (super admin)
- `PUT /users/:id` - Update user
- `DELETE /users/:id` - Delete user (super admin)
- `PATCH /users/:id/approve` - Approve student
- `PATCH /users/:id/reject` - Reject student

### Library Management Endpoints
- `GET /libraries` - Get all libraries
- `GET /libraries/:id` - Get library by ID
- `POST /libraries` - Create library (super admin)
- `PUT /libraries/:id` - Update library
- `DELETE /libraries/:id` - Delete library (super admin)
- `GET /libraries/:id/admins` - Get library admins
- `POST /libraries/:libraryId/admins/:userId` - Assign admin to library
- `DELETE /libraries/:libraryId/admins/:userId` - Remove admin from library

## 🔐 Authentication

The API uses JWT tokens for authentication:

1. **Access Token**: Short-lived (15 minutes), sent in Authorization header
2. **Refresh Token**: Long-lived (7 days), stored in httpOnly cookie

### Example Request
```bash
curl -H "Authorization: Bearer <access_token>" \
     http://localhost:5000/api/v1/auth/profile
```

## 👥 User Roles

### Super Admin
- Full system access
- Create/manage libraries
- Create/manage admins
- Approve/reject students
- System-wide reports

### Admin
- Manage assigned libraries
- Approve/reject students
- Manage books and copies
- Library-specific reports

### Student
- Browse books
- Request book borrowing
- View personal history
- Requires admin approval

### Guest
- Browse books
- Request book borrowing
- No personal history
- Instant registration

## 🗄️ Database Schema

### Collections
- **users**: User accounts and profiles
- **libraries**: Library branches
- **titles**: Book metadata (ISBN, title, authors)
- **inventories**: Library holdings of titles
- **copies**: Individual physical copies
- **borrowRequests**: Book borrowing requests
- **borrowRecords**: Actual loans and returns

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## 📝 Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run setup` - Create super admin user
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors

## 🚀 Deployment

### Environment Variables for Production
```env
NODE_ENV=production
MONGODB_URI=your-production-mongodb-uri
JWT_SECRET=your-production-jwt-secret
JWT_REFRESH_SECRET=your-production-refresh-secret
FRONTEND_URL=https://your-frontend-domain.com
```

### Recommended Platforms
- **Backend**: Render, Railway, or AWS
- **Database**: MongoDB Atlas
- **Frontend**: Vercel or Netlify

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the API documentation
- Review the code comments

---

**Happy Coding! 📚**