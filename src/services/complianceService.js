const RuleEngine = require('./ruleEngine');
const cisRules = require('../rules/cisRules');
const iso27001Rules = require('../rules/iso27001Rules');
const { getDB } = require('../config/mongodb');
const logger = require('../utils/logger');

class ComplianceService {
  constructor() {
    this.ruleEngine = new RuleEngine();
    this.initialized = false;
  }

  /**
   * Initialize the compliance service with all rules
   */
  async initialize() {
    try {
      // Register frameworks
      this.ruleEngine.registerFramework(cisRules.framework);
      this.ruleEngine.registerFramework(iso27001Rules.framework);

      // Register CIS rules
      cisRules.rules.forEach(rule => {
        this.ruleEngine.registerRule(rule);
      });

      // Register ISO 27001 rules
      iso27001Rules.rules.forEach(rule => {
        this.ruleEngine.registerRule(rule);
      });

      this.initialized = true;
      logger.info(`Compliance service initialized with ${this.ruleEngine.getRules().length} rules across ${this.ruleEngine.getFrameworks().length} frameworks`);

    } catch (error) {
      logger.error('Failed to initialize compliance service:', error);
      throw error;
    }
  }

  /**
   * Run compliance check against uploaded data
   */
  async runComplianceCheck(uploadId, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Retrieve uploaded data
      const uploadData = await this.getUploadData(uploadId);
      if (!uploadData) {
        throw new Error(`Upload data not found: ${uploadId}`);
      }

      // Extract the actual data for compliance checking
      const inputData = uploadData.data;
      
      // Run compliance check
      const results = await this.ruleEngine.executeCompliance(inputData, options);
      
      // Add metadata
      results.upload_id = uploadId;
      results.upload_metadata = {
        source: uploadData.source,
        type: uploadData.type,
        uploaded_at: uploadData.uploaded_at,
        file_info: uploadData.file_info
      };

      // Store results in database
      await this.storeComplianceResults(results);

      logger.info(`Compliance check completed for upload ${uploadId}: ${results.passed_rules}/${results.total_rules} passed`);
      
      return results;

    } catch (error) {
      logger.error(`Compliance check failed for upload ${uploadId}:`, error);
      throw error;
    }
  }

  /**
   * Get upload data from MongoDB
   */
  async getUploadData(uploadId) {
    const mongoDb = getDB();
    if (!mongoDb) {
      throw new Error('MongoDB not available');
    }

    const uploadData = await mongoDb.collection('config_data')
      .findOne({ upload_id: uploadId });

    return uploadData;
  }

  /**
   * Store compliance results in MongoDB
   */
  async storeComplianceResults(results) {
    const mongoDb = getDB();
    if (!mongoDb) {
      logger.warn('MongoDB not available - compliance results not stored');
      return;
    }

    try {
      await mongoDb.collection('scan_results').insertOne({
        ...results,
        stored_at: new Date()
      });

      logger.info(`Compliance results stored for session: ${results.session_id}`);
    } catch (error) {
      logger.error('Failed to store compliance results:', error);
      // Don't throw - this is not critical for the compliance check itself
    }
  }

  /**
   * Get compliance history
   */
  async getComplianceHistory(options = {}) {
    const mongoDb = getDB();
    if (!mongoDb) {
      throw new Error('MongoDB not available');
    }

    const {
      page = 1,
      limit = 20,
      framework = null,
      upload_id = null
    } = options;

    const skip = (page - 1) * limit;
    const query = {};

    if (framework) {
      query.frameworks_tested = framework;
    }

    if (upload_id) {
      query.upload_id = upload_id;
    }

    const results = await mongoDb.collection('scan_results')
      .find(query, {
        projection: {
          detailed_results: 0 // Exclude detailed results for list view
        }
      })
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    const total = await mongoDb.collection('scan_results').countDocuments(query);

    return {
      results,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Get detailed compliance results
   */
  async getComplianceResults(sessionId) {
    const mongoDb = getDB();
    if (!mongoDb) {
      throw new Error('MongoDB not available');
    }

    const results = await mongoDb.collection('scan_results')
      .findOne({ session_id: sessionId });

    return results;
  }

  /**
   * Get available frameworks and rules
   */
  getAvailableFrameworks() {
    if (!this.initialized) {
      return [];
    }

    return this.ruleEngine.getFrameworks().map(framework => ({
      ...framework,
      rules_count: this.ruleEngine.getRules(framework.code).length
    }));
  }

  /**
   * Get rules for a specific framework
   */
  getFrameworkRules(frameworkCode) {
    if (!this.initialized) {
      return [];
    }

    return this.ruleEngine.getRules(frameworkCode).map(rule => ({
      code: rule.code,
      title: rule.title,
      description: rule.description,
      category: rule.category,
      severity: rule.severity,
      remediation: rule.remediation
    }));
  }

  /**
   * Run compliance check with sample data for testing
   */
  async runSampleComplianceCheck() {
    if (!this.initialized) {
      await this.initialize();
    }

    // Sample data for testing
    const sampleData = {
      system_info: {
        hostname: "test-server",
        os: "Ubuntu 20.04 LTS",
        kernel: "5.4.0-74-generic"
      },
      security_config: {
        ssh: {
          port: 22,
          root_login: "yes", // This should fail CIS-5.2.4
          password_authentication: "yes",
          permit_empty_passwords: "no"
        },
        firewall: {
          status: "inactive", // This should fail multiple rules
          default_incoming: "allow",
          default_outgoing: "allow"
        },
        users: [
          { username: "root", uid: 0, groups: ["root"], shell: "/bin/bash" },
          { username: "admin", uid: 1000, groups: ["sudo", "admin"], shell: "/bin/bash" },
          { username: "guest", uid: 1001, groups: ["users"], shell: "/bin/bash" } // Risky
        ],
        password_policy: {
          min_length: 6, // Should fail - too short
          require_uppercase: false,
          require_lowercase: true,
          require_numbers: false,
          max_age_days: 365 // Should fail - too long
        }
      },
      services: {
        running: ["ssh", "nginx"],
        stopped: ["apache2", "ftp"],
        enabled: ["ssh", "nginx"],
        disabled: ["apache2", "ftp"]
      },
      network: {
        interfaces: [
          { name: "eth0", ip: "192.168.1.100", status: "up" },
          { name: "lo", ip: "127.0.0.1", status: "up" }
        ],
        open_ports: [22, 80, 443, 21], // Port 21 (FTP) should be flagged
        listening_services: [
          { port: 22, service: "ssh", protocol: "tcp" },
          { port: 80, service: "nginx", protocol: "tcp" },
          { port: 21, service: "ftp", protocol: "tcp" }
        ]
      }
    };

    const results = await this.ruleEngine.executeCompliance(sampleData);
    
    // Add sample metadata
    results.upload_id = 'sample_test';
    results.upload_metadata = {
      source: 'manual',
      type: 'config',
      uploaded_at: new Date(),
      file_info: { format: 'json', size: JSON.stringify(sampleData).length }
    };

    return results;
  }
}

// Create singleton instance
const complianceService = new ComplianceService();

module.exports = complianceService;