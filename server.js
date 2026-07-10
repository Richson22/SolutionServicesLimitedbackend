// server.js (or index.js — wherever your Express app starts)

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const adminShoeRoutes = require('./routes/adminShoeRoutes');
const shoeRoutes = require('./routes/shoeRoutes');
const adminDashboardRoutes = require('./routes/adminDashboardRoutes');
const managerRoutes = require('./routes/managerRoutes');
const appointmentRoutes = require('./routes/appointmentRoutes'); // NEW
const orderRoutes = require('./routes/orderRoutes');

const app = express();

app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());

// Connect to MongoDB Atlas
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB Atlas connected'))
  .catch((err) => console.error('MongoDB connection error:', err));

app.use('/api', authRoutes);
app.use('/api/admin/shoes', adminShoeRoutes);
app.use('/api/shoes', shoeRoutes);
app.use('/api/admin', adminDashboardRoutes);
app.use('/api/manager', managerRoutes);
app.use('/api/student', require('./routes/studentRoutes'));
app.use('/api/appointments', appointmentRoutes); // NEW — matches frontend's /api/appointments calls
app.use('/api/account', require('./routes/accountRoutes'));
app.use('/api/orders', orderRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));