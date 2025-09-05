import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DB_NAME_DEV = process.env.DB_NAME_DEV || 'library-test';
const DB_NAME_PROD = process.env.DB_NAME_PROD || 'library-prod';

if (!MONGODB_URI) {
  throw new Error('MONGODB_URI environment variable is required');
}

// Determine database name based on environment
const getDatabaseName = (): string => {
  if (NODE_ENV === 'production') {
    return DB_NAME_PROD;
  }
  return DB_NAME_DEV;
};

// Create connection URL with database name
const createConnectionUrl = (): string => {
  const dbName = getDatabaseName();
  
  // Parse the existing URI to extract the base connection string
  const url = new URL(MONGODB_URI);
  
  // Set the database name in the pathname
  url.pathname = `/${dbName}`;
  
  // Ensure we have the necessary query parameters
  url.searchParams.set('retryWrites', 'true');
  url.searchParams.set('w', 'majority');
  
  return url.toString();
};

export const connectDatabase = async (): Promise<void> => {
  try {
    const connectionUrl = createConnectionUrl();
    
    await mongoose.connect(connectionUrl);
    
    console.log(`✅ Connected to MongoDB: ${getDatabaseName()}`);
    console.log(`🌍 Environment: ${NODE_ENV}`);
    
    // Handle connection events
    mongoose.connection.on('error', (error) => {
      console.error('❌ MongoDB connection error:', error);
    });
    
    mongoose.connection.on('disconnected', () => {
      console.log('⚠️  MongoDB disconnected');
    });
    
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
    
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error);
    process.exit(1);
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error disconnecting from MongoDB:', error);
  }
};

export { getDatabaseName };
