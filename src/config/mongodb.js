const { MongoClient } = require('mongodb');
const logger = require('../utils/logger');

let client = null;
let db = null;

const connectMongoDB = async () => {
  try {
    const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/compliance_logs';
    
    client = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 3000,
      connectTimeoutMS: 3000
    });

    await client.connect();
    
    const dbName = process.env.MONGODB_DATABASE || 'compliance_logs';
    db = client.db(dbName);
    
    // Test the connection
    await db.admin().ping();
    
    // Initialize collections and indexes
    await initializeCollections();
    
    return db;
  } catch (error) {
    logger.error('❌ MongoDB connection failed:', error.message);
    throw error;
  }
};

const initializeCollections = async () => {
  try {
    // Create collections if they don't exist
    const collections = ['system_logs', 'config_data', 'scan_results', 'audit_logs'];
    
    for (const collectionName of collections) {
      const exists = await db.listCollections({ name: collectionName }).hasNext();
      if (!exists) {
        await db.createCollection(collectionName);
        logger.info(`Created collection: ${collectionName}`);
      }
    }

    // Create indexes for better performance
    await db.collection('system_logs').createIndex({ timestamp: -1 });
    await db.collection('system_logs').createIndex({ source: 1, level: 1 });
    await db.collection('config_data').createIndex({ upload_id: 1 });
    await db.collection('config_data').createIndex({ timestamp: -1 });
    await db.collection('scan_results').createIndex({ session_id: 1 });
    await db.collection('scan_results').createIndex({ timestamp: -1 });
    await db.collection('audit_logs').createIndex({ session_id: 1 });
    await db.collection('audit_logs').createIndex({ timestamp: -1 });

    logger.info('✅ MongoDB collections and indexes initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize MongoDB collections:', error);
    throw error;
  }
};

const getDB = () => {
  if (!db) {
    logger.warn('MongoDB connection not available');
    return null;
  }
  return db;
};

const closeConnection = async () => {
  if (client) {
    await client.close();
    logger.info('MongoDB connection closed');
  }
};

// Sample data insertion helper
const insertSampleData = async () => {
  try {
    const sampleLog = {
      timestamp: new Date(),
      source: 'system',
      level: 'info',
      message: 'Sample system log entry',
      metadata: {
        component: 'auth',
        user_id: 'system',
        action: 'login_attempt'
      }
    };

    await db.collection('system_logs').insertOne(sampleLog);
    logger.info('✅ Sample data inserted into MongoDB');
  } catch (error) {
    logger.error('❌ Failed to insert sample data:', error);
  }
};

module.exports = {
  connectMongoDB,
  getDB,
  closeConnection,
  insertSampleData
};