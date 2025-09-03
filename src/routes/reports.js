const express = require('express');
const Joi = require('joi');
const reportService = require('../services/reportService');
const complianceService = require('../services/complianceService');
const logger = require('../utils/logger');

const router = express.Router();

// Validation schemas
const reportGenerationSchema = Joi.object({
  session_id: Joi.string().required(),
  format: Joi.string().valid('pdf', 'json', 'html').default('pdf'),
  options: Joi.object({
    includeCharts: Joi.boolean().default(true),
    includeRemediation: Joi.boolean().default(true),
    includeEvidence: Joi.boolean().default(false),
    companyName: Joi.string().default('Organization'),
    reportTitle: Joi.string().default('Compliance Audit Report')
  }).default({})
});

const bulkReportSchema = Joi.object({
  upload_id: Joi.string().required(),
  formats: Joi.array().items(Joi.string().valid('pdf', 'json', 'html')).default(['pdf']),
  options: Joi.object({
    includeCharts: Joi.boolean().default(true),
    includeRemediation: Joi.boolean().default(true),
    includeEvidence: Joi.boolean().default(false),
    companyName: Joi.string().default('Organization'),
    reportTitle: Joi.string().default('Compliance Audit Report')
  }).default({})
});

/**
 * Generate report from existing compliance results
 */
router.post('/generate', async (req, res) => {
  try {
    // Validate request
    const { error, value } = reportGenerationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { session_id, format, options } = value;

    // Get compliance results
    const complianceResults = await complianceService.getComplianceResults(session_id);
    if (!complianceResults) {
      return res.status(404).json({
        success: false,
        message: 'Compliance results not found',
        error: `No results found for session: ${session_id}`
      });
    }

    // Generate report
    const report = await reportService.generateReport(complianceResults, format, options);

    logger.info(`Report generated: ${format} format for session ${session_id}`);

    // Set appropriate headers based on format
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.content);
    } else if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.send(report.content);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.content);
    }

  } catch (error) {
    logger.error('Report generation failed:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Compliance results not found',
        error: error.message
      });
    }

    if (error.message.includes('MongoDB not available')) {
      return res.status(503).json({
        success: false,
        message: 'Database not available',
        error: 'MongoDB connection required for report generation'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Report generation failed',
      error: error.message
    });
  }
});

/**
 * Generate report directly from upload data (run compliance check + generate report)
 */
router.post('/generate-from-upload', async (req, res) => {
  try {
    // Validate request
    const { error, value } = bulkReportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: error.details.map(detail => detail.message)
      });
    }

    const { upload_id, formats, options } = value;

    // Run compliance check first
    const complianceResults = await complianceService.runComplianceCheck(upload_id);

    // Generate reports in requested formats
    const reports = {};
    for (const format of formats) {
      try {
        const report = await reportService.generateReport(complianceResults, format, options);
        reports[format] = {
          success: true,
          filename: report.filename,
          size: report.size,
          format: report.format
        };

        // For single format requests, return the file directly
        if (formats.length === 1) {
          if (format === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
            return res.send(report.content);
          } else if (format === 'html') {
            res.setHeader('Content-Type', 'text/html');
            return res.send(report.content);
          } else {
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
            return res.send(report.content);
          }
        }
      } catch (formatError) {
        logger.error(`Failed to generate ${format} report:`, formatError);
        reports[format] = {
          success: false,
          error: formatError.message
        };
      }
    }

    // For multiple formats, return summary
    logger.info(`Bulk report generation completed for upload ${upload_id}`);

    res.status(200).json({
      success: true,
      message: 'Bulk report generation completed',
      data: {
        upload_id,
        session_id: complianceResults.session_id,
        compliance_summary: {
          total_rules: complianceResults.total_rules,
          passed_rules: complianceResults.passed_rules,
          failed_rules: complianceResults.failed_rules,
          overall_risk_score: complianceResults.overall_risk_score
        },
        reports
      }
    });

  } catch (error) {
    logger.error('Bulk report generation failed:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        message: 'Upload data not found',
        error: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Bulk report generation failed',
      error: error.message
    });
  }
});

/**
 * Generate sample report for demonstration
 */
router.post('/generate-sample', async (req, res) => {
  try {
    const { format = 'pdf', options = {} } = req.body;

    // Run sample compliance check
    const complianceResults = await complianceService.runSampleComplianceCheck();

    // Generate report
    const report = await reportService.generateReport(complianceResults, format, {
      companyName: 'Demo Organization',
      reportTitle: 'Sample Compliance Audit Report',
      includeCharts: true,
      includeRemediation: true,
      includeEvidence: false,
      ...options
    });

    logger.info(`Sample report generated in ${format} format`);

    // Return report based on format
    if (format === 'pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.content);
    } else if (format === 'html') {
      res.setHeader('Content-Type', 'text/html');
      res.send(report.content);
    } else {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${report.filename}"`);
      res.send(report.content);
    }

  } catch (error) {
    logger.error('Sample report generation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Sample report generation failed',
      error: error.message
    });
  }
});

/**
 * Get report metadata without generating the full report
 */
router.get('/preview/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get compliance results
    const complianceResults = await complianceService.getComplianceResults(sessionId);
    if (!complianceResults) {
      return res.status(404).json({
        success: false,
        message: 'Compliance results not found'
      });
    }

    // Generate enhanced results for preview
    const enhancedResults = await reportService.enhanceResults(complianceResults);

    // Return preview data
    const preview = {
      session_id: sessionId,
      basic_info: {
        timestamp: enhancedResults.timestamp,
        frameworks_tested: enhancedResults.frameworks_tested,
        total_rules: enhancedResults.total_rules,
        passed_rules: enhancedResults.passed_rules,
        failed_rules: enhancedResults.failed_rules,
        overall_risk_score: enhancedResults.overall_risk_score
      },
      risk_analysis: enhancedResults.risk_analysis,
      executive_summary: enhancedResults.executive_summary,
      framework_summary: Object.entries(enhancedResults.framework_results).map(([code, data]) => ({
        framework: data.framework,
        code,
        compliance_percentage: data.compliance_percentage,
        risk_score: data.risk_score,
        critical_failures: data.rule_results.filter(r => 
          r.status === 'FAIL' && r.severity === 'critical'
        ).length
      })),
      top_issues: enhancedResults.risk_analysis.top_risks,
      remediation_summary: {
        immediate_actions: enhancedResults.remediation_priority.filter(p => 
          p.priority_level === 'Immediate'
        ).length,
        high_priority: enhancedResults.remediation_priority.filter(p => 
          p.priority_level === 'High'
        ).length,
        total_items: enhancedResults.remediation_priority.length
      }
    };

    res.status(200).json({
      success: true,
      message: 'Report preview generated successfully',
      data: preview
    });

  } catch (error) {
    logger.error('Report preview generation failed:', error);
    res.status(500).json({
      success: false,
      message: 'Report preview generation failed',
      error: error.message
    });
  }
});

/**
 * Get available report formats and options
 */
router.get('/formats', (req, res) => {
  try {
    const formats = {
      pdf: {
        name: 'PDF Report',
        description: 'Professional PDF report with charts and detailed analysis',
        mime_type: 'application/pdf',
        features: ['Charts', 'Executive Summary', 'Detailed Findings', 'Remediation Plan']
      },
      json: {
        name: 'JSON Export',
        description: 'Machine-readable JSON format with all data',
        mime_type: 'application/json',
        features: ['Complete Data', 'API Integration', 'Custom Processing']
      },
      html: {
        name: 'HTML Report',
        description: 'Web-viewable HTML report',
        mime_type: 'text/html',
        features: ['Web Viewing', 'Interactive Elements', 'Print-Friendly']
      }
    };

    const options = {
      includeCharts: {
        type: 'boolean',
        default: true,
        description: 'Include visual charts and graphs'
      },
      includeRemediation: {
        type: 'boolean',
        default: true,
        description: 'Include detailed remediation guidance'
      },
      includeEvidence: {
        type: 'boolean',
        default: false,
        description: 'Include technical evidence and raw data'
      },
      companyName: {
        type: 'string',
        default: 'Organization',
        description: 'Company name for report header'
      },
      reportTitle: {
        type: 'string',
        default: 'Compliance Audit Report',
        description: 'Custom report title'
      }
    };

    res.status(200).json({
      success: true,
      message: 'Available report formats and options',
      data: {
        formats,
        options,
        supported_formats: Object.keys(formats)
      }
    });

  } catch (error) {
    logger.error('Failed to get report formats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve report formats',
      error: error.message
    });
  }
});

module.exports = router;