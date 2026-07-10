// createAdmin.js
// Place this in your SolutionServicesBackend root folder (same level as server.js)
//
// Run this ONCE to create your first admin user:
//   node createAdmin.js
//
// Then delete this file (or at least don't leave it lying around in production —
// anyone who runs it can create another admin).

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdmin() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // CHANGE these before running
  const email = 'abachorsimon2022@gmail.com';
  const plainPassword = 'Admin1234';
  const name = 'Admin';

  const existing = await User.findOne({ email });
  if (existing) {
    console.log('A user with this email already exists. Role:', existing.role);
    await mongoose.disconnect();
    return;
  }

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  const admin = await User.create({
    name,
    email,
    password: hashedPassword,
    role: 'admin',
    mustChangePassword: true,
  });

  console.log('Admin created:');
  console.log('  email:', admin.email);
  console.log('  temp password:', plainPassword);
  console.log('Log in with these, then change the password.');

  await mongoose.disconnect();
}

createAdmin().catch((err) => {
  console.error('Error creating admin:', err);
  process.exit(1);
});