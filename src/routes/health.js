const express = require('express');
const { getConnection } = require('../config/mysql');
const { getDB } = require('../config/mongodb');
const logger = require('../utils/logger');

const router = express.Router();

// Health check endpoint
router.get('/', async (req, res) => {
  try {
    const healthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Compliance Audit Tool',
      version: '1.0.0',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      databases: {
        mysql: 'disconnected',
        mongodb: 'disconnected'
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    };

    // Check MySQL connection
    try {
      const mysqlConnection = getConnection();
      if (mysqlConnection) {
        await mysqlConnection.ping();
        healthStatus.databases.mysql = 'connected';
      } else {
        healthStatus.databases.mysql = 'not configured';
        healthStatus.status = 'degraded';
      }
    } catch (error) {
      healthStatus.databases.mysql = 'error: ' + error.message;
      healthStatus.status = 'degraded';
    }

    // Check MongoDB connection
    try {
      const mongoDb = getDB();
      if (mongoDb) {
        await mongoDb.admin().ping();
        healthStatus.databases.mongodb = 'connected';
      } else {
        healthStatus.databases.mongodb = 'not configured';
        healthStatus.status = 'degraded';
      }
    } catch (error) {
      healthStatus.databases.mongodb = 'error: ' + error.message;
      healthStatus.status = 'degraded';
    }

    // Determine overall status
    if (healthStatus.databases.mysql.includes('error') && healthStatus.databases.mongodb.includes('error')) {
      healthStatus.status = 'unhealthy';
    }

    const statusCode = healthStatus.status === 'healthy' ? 200 : 
                      healthStatus.status === 'degraded' ? 200 : 503;

    logger.info(`Health check performed - Status: ${healthStatus.status}`);

    res.status(statusCode).json({
      success: true,
      data: healthStatus
    });

  } catch (error) {
    logger.error('Health check failed:', error);
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      message: 'Health check failed',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Detailed system info endpoint
router.get('/detailed', async (req, res) => {
  try {
    const detailedInfo = {
      service: 'Compliance Audit Tool',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      system: {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        pid: process.pid
      },
      memory: process.memoryUsage(),
      databases: {
        mysql: {
          status: 'unknown',
          config: {
            host: process.env.MYSQL_HOST,
            port: process.env.MYSQL_PORT,
            database: process.env.MYSQL_DATABASE
          }
        },
        mongodb: {
          status: 'unknown',
          config: {
            uri: process.env.MONGODB_URI?.replace(/\/\/.*@/, '//***:***@') || 'Not configured'
          }
        }
      },
      environment: {
        nodeEnv: process.env.NODE_ENV,
        port: process.env.PORT,
        logLevel: process.env.LOG_LEVEL
      }
    };

    // Test database connections
    try {
      const mysqlConnection = getConnection();
      await mysqlConnection.ping();
      detailedInfo.databases.mysql.status = 'connected';
    } catch (error) {
      detailedInfo.databases.mysql.status = 'error';
      detailedInfo.databases.mysql.error = error.message;
    }

    try {
      const mongoDb = getDB();
      await mongoDb.admin().ping();
      detailedInfo.databases.mongodb.status = 'connected';
    } catch (error) {
      detailedInfo.databases.mongodb.status = 'error';
      detailedInfo.databases.mongodb.error = error.message;
    }

    res.json({
      success: true,
      data: detailedInfo
    });

  } catch (error) {
    logger.error('Detailed health check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Detailed health check failed',
      error: error.message
    });
  }
});

module.exports = router;