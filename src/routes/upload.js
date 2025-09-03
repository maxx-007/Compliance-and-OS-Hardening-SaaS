const express = require('express');
const multer = require('multer');
const Joi = require('joi');
const { getDB } = require('../config/mongodb');
const logger = require('../utils/logger');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    files: 10 // Maximum 10 files
  },
  fileFilter: (req, file, cb) => {
    // Accept JSON, TXT, LOG, and CSV files
    const allowedTypes = ['application/json', 'text/plain', 'text/csv', 'application/csv'];
    const allowedExtensions = ['.json', '.txt', '.log', '.csv'];
    
    const hasValidType = allowedTypes.includes(file.mimetype);
    const hasValidExtension = allowedExtensions.some(ext => 
      file.originalname.toLowerCase().endsWith(ext)
    );
    
    if (hasValidType || hasValidExtension) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JSON, TXT, LOG, and CSV files are allowed.'), false);
    }
  }
});

// Validation schemas
const configUploadSchema = Joi.object({
  source: Joi.string().valid('manual', 'system_scan', 'log_file', 'cloud_scan').required(),
  type: Joi.string().valid('config', 'logs', 'policies', 'scan_results').required(),
  description: Joi.string().max(500).optional(),
  metadata: Joi.object().optional()
});

const jsonDataSchema = Joi.object({
  data: Joi.alternatives().try(
    Joi.object(),
    Joi.array()
  ).required(),
  source: Joi.string().required(),
  type: Joi.string().required(),
  timestamp: Joi.date().optional(),
  metadata: Joi.object().optional()
});

// Upload endpoint for JSON data (direct API call)
router.post('/json', async (req, res) => {
  try {
    // Validate request body
    const { error, value } = jsonDataSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { data, source, type, timestamp, metadata } = value;
    const uploadId = generateUploadId();

    // Store in MongoDB (if available)
    const mongoDb = getDB();
    if (!mongoDb) {
      return res.status(503).json({
        success: false,
        message: 'Database not available - MongoDB connection required for uploads',
        error: 'MongoDB not connected'
      });
    }

    const uploadRecord = {
      upload_id: uploadId,
      source,
      type,
      data,
      metadata: metadata || {},
      timestamp: timestamp || new Date(),
      uploaded_at: new Date(),
      file_info: {
        size: JSON.stringify(data).length,
        format: 'json',
        records_count: Array.isArray(data) ? data.length : 1
      }
    };

    await mongoDb.collection('config_data').insertOne(uploadRecord);

    logger.info(`JSON data uploaded successfully - ID: ${uploadId}, Type: ${type}, Source: ${source}`);

    res.status(201).json({
      success: true,
      message: 'JSON data uploaded successfully',
      data: {
        upload_id: uploadId,
        source,
        type,
        records_count: uploadRecord.file_info.records_count,
        size: uploadRecord.file_info.size,
        timestamp: uploadRecord.timestamp
      }
    });

  } catch (error) {
    logger.error('JSON upload failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload JSON data',
      error: error.message
    });
  }
});

// Upload endpoint for files
router.post('/files', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No files uploaded'
      });
    }

    // Validate form data
    const { error, value } = configUploadSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { source, type, description, metadata } = value;
    const uploadResults = [];
    const mongoDb = getDB();
    
    if (!mongoDb) {
      return res.status(503).json({
        success: false,
        message: 'Database not available - MongoDB connection required for file uploads',
        error: 'MongoDB not connected'
      });
    }

    // Process each file
    for (const file of req.files) {
      const uploadId = generateUploadId();
      let parsedData;

      try {
        // Parse file content based on type
        const fileContent = file.buffer.toString('utf8');
        
        if (file.originalname.toLowerCase().endsWith('.json')) {
          parsedData = JSON.parse(fileContent);
        } else {
          // For non-JSON files, store as text with line-by-line parsing
          parsedData = {
            raw_content: fileContent,
            lines: fileContent.split('\n').filter(line => line.trim()),
            line_count: fileContent.split('\n').length
          };
        }

        // Store in MongoDB
        const uploadRecord = {
          upload_id: uploadId,
          source,
          type,
          description: description || '',
          data: parsedData,
          metadata: metadata || {},
          timestamp: new Date(),
          file_info: {
            original_name: file.originalname,
            size: file.size,
            mimetype: file.mimetype,
            format: file.originalname.split('.').pop().toLowerCase()
          }
        };

        await mongoDb.collection('config_data').insertOne(uploadRecord);

        uploadResults.push({
          upload_id: uploadId,
          filename: file.originalname,
          size: file.size,
          status: 'success'
        });

        logger.info(`File uploaded successfully - ID: ${uploadId}, File: ${file.originalname}`);

      } catch (parseError) {
        logger.error(`Failed to parse file ${file.originalname}:`, parseError);
        uploadResults.push({
          filename: file.originalname,
          size: file.size,
          status: 'error',
          error: 'Failed to parse file content'
        });
      }
    }

    const successCount = uploadResults.filter(r => r.status === 'success').length;
    const errorCount = uploadResults.filter(r => r.status === 'error').length;

    res.status(successCount > 0 ? 201 : 400).json({
      success: successCount > 0,
      message: `Processed ${req.files.length} files: ${successCount} successful, ${errorCount} failed`,
      data: {
        source,
        type,
        total_files: req.files.length,
        successful_uploads: successCount,
        failed_uploads: errorCount,
        results: uploadResults
      }
    });

  } catch (error) {
    logger.error('File upload failed:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload files',
      error: error.message
    });
  }
});

// Get upload history
router.get('/history', async (req, res) => {
  try {
    const mongoDb = getDB();
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const uploads = await mongoDb.collection('config_data')
      .find({}, { 
        projection: { 
          data: 0 // Exclude large data field from list view
        } 
      })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await mongoDb.collection('config_data').countDocuments();

    res.json({
      success: true,
      data: {
        uploads,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Failed to fetch upload history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload history',
      error: error.message
    });
  }
});

// Get specific upload by ID
router.get('/:uploadId', async (req, res) => {
  try {
    const { uploadId } = req.params;
    const mongoDb = getDB();

    const upload = await mongoDb.collection('config_data')
      .findOne({ upload_id: uploadId });

    if (!upload) {
      return res.status(404).json({
        success: false,
        message: 'Upload not found'
      });
    }

    res.json({
      success: true,
      data: upload
    });

  } catch (error) {
    logger.error('Failed to fetch upload:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch upload',
      error: error.message
    });
  }
});

// Helper function to generate unique upload ID
function generateUploadId() {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `upload_${timestamp}_${randomStr}`;
}

module.exports = router;