#!/bin/bash

# Script to create admin user for VPN service
echo "Creating admin user script"

# Create temporary directory
mkdir -p /tmp/create-admin

# Create admin user script
cat > /tmp/create-admin/create-admin.js << 'EOF'
// Script to create an admin user in the MongoDB database
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

// Connect to MongoDB 
mongoose.connect('mongodb://admin:securePassword123@mongodb:27017/vpn-service?authSource=admin', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Define Admin Schema - must match your existing schema
const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'manager'],
    default: 'admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add the comparePassword method to match your existing model
adminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw new Error(error);
  }
};

// Create Admin model
const Admin = mongoose.model('Admin', adminSchema);

// Function to create an admin
async function createAdmin() {
  try {
    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email: 'admin@example.com' });
    
    if (existingAdmin) {
      console.log('Admin already exists. Updating password...');
      
      // Update password
      const hashedPassword = await bcrypt.hash('admin123', 10);
      existingAdmin.password = hashedPassword;
      await existingAdmin.save();
      
      console.log('Admin password updated successfully!');
      console.log('Email: admin@example.com');
      console.log('Password: admin123');
      return;
    }
    
    // Create new admin
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const newAdmin = new Admin({
      username: 'admin',
      email: 'admin@example.com',
      password: hashedPassword,
      role: 'admin'
    });
    
    await newAdmin.save();
    console.log('Admin created successfully!');
    console.log('Email: admin@example.com');
    console.log('Password: admin123');
  } catch (error) {
    console.error('Error creating admin:', error);
  } finally {
    // Close database connection
    setTimeout(() => {
      mongoose.connection.close();
      process.exit(0);
    }, 1000);
  }
}

// Run the function
createAdmin();
EOF

# Create Dockerfile for admin setup
cat > /tmp/create-admin/Dockerfile << 'EOF'
FROM node:16-alpine
WORKDIR /app
COPY create-admin.js .
RUN npm install bcrypt mongoose
CMD ["node", "create-admin.js"]
EOF

# Build and run the container
cd /tmp/create-admin
echo "Building admin setup container..."
docker build -t admin-setup .
echo "Running admin setup..."
docker run --rm --network vpn-deployment_vpn-network admin-setup

# Cleanup
echo "Cleaning up..."
cd -
rm -rf /tmp/create-admin

echo "Admin setup complete!"
echo "You can now login with:"
echo "Email: admin@example.com"
echo "Password: admin123"