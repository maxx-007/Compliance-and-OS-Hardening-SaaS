const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const logger = require('./src/utils/logger');
const { connectMySQL } = require('./src/config/mysql');
const { connectMongoDB } = require('./src/config/mongodb');

// Import routes
const healthRoutes = require('./src/routes/health');
const uploadRoutes = require('./src/routes/upload');
const complianceRoutes = require('./src/routes/compliance');
const reportsRoutes = require('./src/routes/reports');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/reports', reportsRoutes);

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Initialize databases and start server
async function startServer() {
  let dbStatus = { mysql: false, mongodb: false };
  
  // Try to connect to databases (non-blocking for demo)
  try {
    await connectMySQL();
    dbStatus.mysql = true;
    logger.info('✅ MySQL connected successfully');
  } catch (error) {
    logger.warn('⚠️ MySQL connection failed (continuing without MySQL):', error.message);
  }

  try {
    await connectMongoDB();
    dbStatus.mongodb = true;
    logger.info('✅ MongoDB connected successfully');
  } catch (error) {
    logger.warn('⚠️ MongoDB connection failed (continuing without MongoDB):', error.message);
  }

  // Start server regardless of database status
  app.listen(PORT, () => {
    logger.info(`🚀 Compliance Audit Tool server running on port ${PORT}`);
    logger.info(`📊 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
    logger.info(`💾 Database status: MySQL=${dbStatus.mysql ? 'Connected' : 'Disconnected'}, MongoDB=${dbStatus.mongodb ? 'Connected' : 'Disconnected'}`);
    
    if (!dbStatus.mysql && !dbStatus.mongodb) {
      logger.warn('⚠️ Server started without database connections - some features may not work');
      logger.info('💡 To fix: Update database credentials in .env file and restart');
    }
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

startServer();

module.exports = app;