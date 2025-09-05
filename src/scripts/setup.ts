import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { User } from '@/models/User';
import { Library } from '@/models/Library';
import { generateAccessToken, generateRefreshToken } from '@/middleware/auth';
import { UserRole } from '@/types';

// Load environment variables
dotenv.config();

interface SetupOptions {
  name: string;
  email: string;
  password: string;
  createDefaultLibrary?: boolean;
  libraryName?: string;
  libraryCode?: string;
}

const generateSecurePassword = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
};

const createSuperAdmin = async (options: SetupOptions) => {
  try {
    console.log('🔧 Setting up Library Management System...\n');

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'superadmin' });
    if (existingSuperAdmin) {
      console.log('⚠️  Super admin already exists!');
      console.log(`   Email: ${existingSuperAdmin.email}`);
      console.log('   If you need to reset the super admin, please delete the existing user from the database.\n');
      return;
    }

    // Create super admin user
    const superAdmin = new User({
      name: options.name,
      email: options.email.toLowerCase(),
      passwordHash: options.password, // Will be hashed by pre-save middleware
      role: 'superadmin' as UserRole,
      status: 'active'
    });

    await superAdmin.save();
    console.log('✅ Super admin created successfully!');

    // Create default library if requested
    if (options.createDefaultLibrary) {
      const defaultLibrary = new Library({
        code: options.libraryCode || 'MAIN-01',
        name: options.libraryName || 'Main Library',
        location: {
          address: '123 Library Street',
          city: 'Library City',
          state: 'LC',
          country: 'USA'
        },
        contact: {
          email: 'admin@library.com',
          phone: '+1-555-0123'
        }
      });

      await defaultLibrary.save();
      console.log('✅ Default library created successfully!');
      console.log(`   Library: ${defaultLibrary.name} (${defaultLibrary.code})`);
    }

    // Generate tokens for initial login
    const accessToken = generateAccessToken({
      userId: superAdmin._id.toString(),
      email: superAdmin.email,
      role: superAdmin.role,
      libraries: superAdmin.libraries
    });

    const refreshToken = generateRefreshToken({
      userId: superAdmin._id.toString(),
      email: superAdmin.email,
      role: superAdmin.role,
      libraries: superAdmin.libraries
    });

    console.log('\n🎉 Setup completed successfully!\n');
    console.log('📋 Super Admin Credentials:');
    console.log(`   Name: ${superAdmin.name}`);
    console.log(`   Email: ${superAdmin.email}`);
    console.log(`   Password: ${options.password}`);
    console.log(`   Role: ${superAdmin.role}`);
    console.log(`   Status: ${superAdmin.status}`);
    
    console.log('\n🔑 Access Tokens (for testing):');
    console.log(`   Access Token: ${accessToken}`);
    console.log(`   Refresh Token: ${refreshToken}`);
    
    console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
    console.log('   - Save these credentials securely');
    console.log('   - Change the password after first login');
    console.log('   - Do not share these tokens in production');
    console.log('   - The refresh token should be stored in httpOnly cookies');
    
    console.log('\n🚀 Next Steps:');
    console.log('   1. Start the server: npm run dev');
    console.log('   2. Login with the super admin credentials');
    console.log('   3. Create libraries and assign admins');
    console.log('   4. Import books and start using the system');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    throw error;
  }
};

const interactiveSetup = async () => {
  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(query, resolve);
    });
  };

  try {
    console.log('🏗️  Library Management System Setup\n');
    console.log('This script will create the initial super admin user.\n');

    const name = await question('Super Admin Name: ');
    const email = await question('Super Admin Email: ');
    
    let password = await question('Super Admin Password (leave empty for auto-generated): ');
    if (!password.trim()) {
      password = generateSecurePassword();
      console.log(`Auto-generated password: ${password}`);
    }

    const createLibrary = await question('Create default library? (y/N): ');
    const createDefaultLibrary = createLibrary.toLowerCase() === 'y' || createLibrary.toLowerCase() === 'yes';

    let libraryName = '';
    let libraryCode = '';
    
    if (createDefaultLibrary) {
      libraryName = await question('Library Name (default: Main Library): ') || 'Main Library';
      libraryCode = await question('Library Code (default: MAIN-01): ') || 'MAIN-01';
    }

    rl.close();

    const options: SetupOptions = {
      name: name.trim(),
      email: email.trim(),
      password: password.trim(),
      createDefaultLibrary,
      libraryName: libraryName.trim(),
      libraryCode: libraryCode.trim().toUpperCase()
    };

    await createSuperAdmin(options);

  } catch (error) {
    console.error('❌ Interactive setup failed:', error);
    rl.close();
    process.exit(1);
  }
};

const main = async () => {
  try {
    // Connect to database
    await connectDatabase();

    // Check command line arguments
    const args = process.argv.slice(2);
    
    if (args.length >= 3) {
      // Non-interactive setup
      const [name, email, password] = args;
      const createLibrary = args[3] === '--create-library';
      const libraryName = args[4] || 'Main Library';
      const libraryCode = args[5] || 'MAIN-01';

      await createSuperAdmin({
        name,
        email,
        password,
        createDefaultLibrary: createLibrary,
        libraryName,
        libraryCode
      });
    } else {
      // Interactive setup
      await interactiveSetup();
    }

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  } finally {
    await disconnectDatabase();
  }
};

// Run setup if this file is executed directly
if (require.main === module) {
  main();
}

export { createSuperAdmin, interactiveSetup };
