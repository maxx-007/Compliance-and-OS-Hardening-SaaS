const express = require('express');
const Joi = require('joi');
const complianceService = require('../services/complianceService');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const complianceCheckSchema = Joi.object({
  upload_id: Joi.string().required(),
  frameworks: Joi.array().items(Joi.string().valid('CIS', 'ISO27001')).optional(),
  categories: Joi.array().items(Joi.string()).optional(),
  severity: Joi.array().items(Joi.string().valid('low', 'medium', 'high', 'critical')).optional()
});

const historyQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  framework: Joi.string().valid('CIS', 'ISO27001').optional(),
  upload_id: Joi.string().optional()
});

/**
 * Run compliance check against uploaded data
 */
router.post('/check', async (req, res) => {
  try {
    // Validate request
    const { error, value } = complianceCheckSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { upload_id, frameworks, categories, severity } = value;

    // Run compliance check
    const results = await complianceService.runComplianceCheck(upload_id, {
      frameworks,
      categories,
      severity
    });

    logger.info(`Compliance check API called for upload: ${upload_id}`);

    res.status(200).json({
      success: true,
      message: 'Compliance check completed successfully',
      data: results
    });

  } catch (error) {
    logger.error('Compliance check API failed:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Upload data not found',
        error: error.message
      });
    }

    if (error.message.includes('MongoDB not available')) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
        error: 'MongoDB connection required for compliance checks'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Compliance check failed',
      error: error.message
    });
  }
});

/**
 * Run sample compliance check for testing
 */
router.post('/check/sample', async (req, res) => {
  try {
    const results = await complianceService.runSampleComplianceCheck();

    logger.info('Sample compliance check executed via API');

    res.status(200).json({
      success: true,
      message: 'Sample compliance check completed successfully',
      data: results
    });

  } catch (error) {
    logger.error('Sample compliance check failed:', error);
    res.status(500).json({
      success: false,
      message: 'Sample compliance check failed',
      error: error.message
    });
  }
});

/**
 * Get compliance check history
 */
router.get('/history', async (req, res) => {
  try {
    // Validate query parameters
    const { error, value } = historyQuerySchema.validate(req.query);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const history = await complianceService.getComplianceHistory(value);

    res.status(200).json({
      success: true,
      message: 'Compliance history retrieved successfully',
      data: history
    });

  } catch (error) {
    logger.error('Failed to get compliance history:', error);
    
    if (error.message.includes('MongoDB not available')) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
        error: 'MongoDB connection required'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance history',
      error: error.message
    });
  }
});

/**
 * Get detailed compliance results by session ID
 */
router.get('/results/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const results = await complianceService.getComplianceResults(sessionId);

    if (!results) {
      return res.status(404).json({
        success: false,
        message: 'Compliance results not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Compliance results retrieved successfully',
      data: results
    });

  } catch (error) {
    logger.error('Failed to get compliance results:', error);
    
    if (error.message.includes('MongoDB not available')) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
        error: 'MongoDB connection required'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance results',
      error: error.message
    });
  }
});

/**
 * Get available compliance frameworks
 */
router.get('/frameworks', async (req, res) => {
  try {
    const frameworks = complianceService.getAvailableFrameworks();

    res.status(200).json({
      success: true,
      message: 'Available frameworks retrieved successfully',
      data: {
        frameworks,
        total_frameworks: frameworks.length,
        total_rules: frameworks.reduce((sum, fw) => sum + fw.rules_count, 0)
      }
    });

  } catch (error) {
    logger.error('Failed to get frameworks:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve frameworks',
      error: error.message
    });
  }
});

/**
 * Get rules for a specific framework
 */
router.get('/frameworks/:frameworkCode/rules', async (req, res) => {
  try {
    const { frameworkCode } = req.params;

    if (!['CIS', 'ISO27001'].includes(frameworkCode)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid framework code. Supported: CIS, ISO27001'
      });
    }

    const rules = complianceService.getFrameworkRules(frameworkCode);

    res.status(200).json({
      success: true,
      message: `Rules for ${frameworkCode} retrieved successfully`,
      data: {
        framework: frameworkCode,
        rules,
        total_rules: rules.length
      }
    });

  } catch (error) {
    logger.error(`Failed to get rules for framework ${req.params.frameworkCode}:`, error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve framework rules',
      error: error.message
    });
  }
});

/**
 * Get compliance statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const frameworks = complianceService.getAvailableFrameworks();
    const history = await complianceService.getComplianceHistory({ limit: 100 });

    // Calculate statistics
    const stats = {
      total_frameworks: frameworks.length,
      total_rules: frameworks.reduce((sum, fw) => sum + fw.rules_count, 0),
      total_checks_performed: history.pagination.total,
      frameworks_breakdown: frameworks.map(fw => ({
        name: fw.name,
        code: fw.code,
        version: fw.version,
        rules_count: fw.rules_count
      }))
    };

    // Calculate average compliance scores if we have history
    if (history.results.length > 0) {
      const recentResults = history.results.slice(0, 10); // Last 10 results
      const avgRiskScore = recentResults.reduce((sum, result) => sum + result.overall_risk_score, 0) / recentResults.length;
      const avgComplianceRate = recentResults.reduce((sum, result) => {
        const total = result.total_rules - result.skipped_rules;
        return sum + (total > 0 ? (result.passed_rules / total) * 100 : 0);
      }, 0) / recentResults.length;

      stats.recent_performance = {
        average_risk_score: Math.round(avgRiskScore * 100) / 100,
        average_compliance_rate: Math.round(avgComplianceRate * 100) / 100,
        sample_size: recentResults.length
      };
    }

    res.status(200).json({
      success: true,
      message: 'Compliance statistics retrieved successfully',
      data: stats
    });

  } catch (error) {
    logger.error('Failed to get compliance statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve compliance statistics',
      error: error.message
    });
  }
});

module.exports = router;