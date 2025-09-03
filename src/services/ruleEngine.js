const logger = require('../utils/logger');

class RuleEngine {
  constructor() {
    this.rules = new Map();
    this.frameworks = new Map();
  }

  /**
   * Register a compliance framework
   */
  registerFramework(framework) {
    this.frameworks.set(framework.code, framework);
    logger.info(`Framework registered: ${framework.name} (${framework.code})`);
  }

  /**
   * Register a compliance rule
   */
  registerRule(rule) {
    if (!this.frameworks.has(rule.framework)) {
      throw new Error(`Framework ${rule.framework} not registered`);
    }

    const ruleKey = `${rule.framework}:${rule.code}`;
    this.rules.set(ruleKey, rule);
    logger.info(`Rule registered: ${ruleKey} - ${rule.title}`);
  }

  /**
   * Execute compliance check against input data
   */
  async executeCompliance(inputData, options = {}) {
    const {
      frameworks = null, // null = all frameworks, or array of framework codes
      categories = null,  // null = all categories, or array of categories
      severity = null     // null = all severities, or array of severities
    } = options;

    const startTime = Date.now();
    const results = {
      session_id: this.generateSessionId(),
      timestamp: new Date(),
      input_data_summary: this.summarizeInputData(inputData),
      frameworks_tested: [],
      total_rules: 0,
      passed_rules: 0,
      failed_rules: 0,
      skipped_rules: 0,
      execution_time_ms: 0,
      overall_risk_score: 0,
      framework_results: {},
      detailed_results: []
    };

    try {
      // Filter rules based on criteria
      const rulesToExecute = this.filterRules(frameworks, categories, severity);
      results.total_rules = rulesToExecute.length;

      // Group rules by framework for organized execution
      const rulesByFramework = this.groupRulesByFramework(rulesToExecute);
      results.frameworks_tested = Object.keys(rulesByFramework);

      // Execute rules for each framework
      for (const [frameworkCode, frameworkRules] of Object.entries(rulesByFramework)) {
        const frameworkResult = await this.executeFrameworkRules(
          frameworkCode, 
          frameworkRules, 
          inputData
        );
        
        results.framework_results[frameworkCode] = frameworkResult;
        results.passed_rules += frameworkResult.passed;
        results.failed_rules += frameworkResult.failed;
        results.skipped_rules += frameworkResult.skipped;
        results.detailed_results.push(...frameworkResult.rule_results);
      }

      // Calculate overall risk score
      results.overall_risk_score = this.calculateRiskScore(results);
      results.execution_time_ms = Date.now() - startTime;

      logger.info(`Compliance check completed: ${results.passed_rules}/${results.total_rules} passed, Risk Score: ${results.overall_risk_score}%`);
      
      return results;

    } catch (error) {
      logger.error('Compliance execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute rules for a specific framework
   */
  async executeFrameworkRules(frameworkCode, rules, inputData) {
    const framework = this.frameworks.get(frameworkCode);
    const result = {
      framework: framework.name,
      framework_code: frameworkCode,
      version: framework.version,
      total: rules.length,
      passed: 0,
      failed: 0,
      skipped: 0,
      compliance_percentage: 0,
      risk_score: 0,
      rule_results: []
    };

    for (const rule of rules) {
      try {
        const ruleResult = await this.executeRule(rule, inputData);
        result.rule_results.push(ruleResult);

        switch (ruleResult.status) {
          case 'PASS':
            result.passed++;
            break;
          case 'FAIL':
            result.failed++;
            break;
          case 'SKIP':
            result.skipped++;
            break;
        }
      } catch (error) {
        logger.error(`Rule execution failed: ${rule.code}`, error);
        result.rule_results.push({
          rule_code: rule.code,
          rule_title: rule.title,
          status: 'ERROR',
          message: `Execution error: ${error.message}`,
          severity: rule.severity,
          category: rule.category
        });
        result.failed++;
      }
    }

    result.compliance_percentage = result.total > 0 ? 
      Math.round((result.passed / (result.total - result.skipped)) * 100) : 0;
    
    result.risk_score = this.calculateFrameworkRiskScore(result);

    return result;
  }

  /**
   * Execute a single compliance rule
   */
  async executeRule(rule, inputData) {
    const ruleResult = {
      rule_code: rule.code,
      rule_title: rule.title,
      status: 'SKIP',
      message: '',
      details: {},
      severity: rule.severity,
      category: rule.category,
      remediation: rule.remediation || 'No remediation provided'
    };

    try {
      // Execute the rule logic
      const evaluation = await rule.evaluate(inputData);
      
      ruleResult.status = evaluation.passed ? 'PASS' : 'FAIL';
      ruleResult.message = evaluation.message;
      ruleResult.details = evaluation.details || {};

      if (!evaluation.passed) {
        ruleResult.findings = evaluation.findings || [];
        ruleResult.evidence = evaluation.evidence || {};
      }

    } catch (error) {
      ruleResult.status = 'ERROR';
      ruleResult.message = `Rule evaluation error: ${error.message}`;
      logger.error(`Rule ${rule.code} evaluation failed:`, error);
    }

    return ruleResult;
  }

  /**
   * Filter rules based on criteria
   */
  filterRules(frameworks, categories, severity) {
    let filteredRules = Array.from(this.rules.values());

    if (frameworks && frameworks.length > 0) {
      filteredRules = filteredRules.filter(rule => frameworks.includes(rule.framework));
    }

    if (categories && categories.length > 0) {
      filteredRules = filteredRules.filter(rule => categories.includes(rule.category));
    }

    if (severity && severity.length > 0) {
      filteredRules = filteredRules.filter(rule => severity.includes(rule.severity));
    }

    return filteredRules;
  }

  /**
   * Group rules by framework
   */
  groupRulesByFramework(rules) {
    return rules.reduce((groups, rule) => {
      if (!groups[rule.framework]) {
        groups[rule.framework] = [];
      }
      groups[rule.framework].push(rule);
      return groups;
    }, {});
  }

  /**
   * Calculate overall risk score
   */
  calculateRiskScore(results) {
    if (results.total_rules === 0) return 0;

    const effectiveTotal = results.total_rules - results.skipped_rules;
    if (effectiveTotal === 0) return 0;

    const failureRate = results.failed_rules / effectiveTotal;
    return Math.round(failureRate * 100);
  }

  /**
   * Calculate framework-specific risk score
   */
  calculateFrameworkRiskScore(frameworkResult) {
    const effectiveTotal = frameworkResult.total - frameworkResult.skipped;
    if (effectiveTotal === 0) return 0;

    // Weight by severity
    let weightedFailures = 0;
    let totalWeight = 0;

    frameworkResult.rule_results.forEach(result => {
      if (result.status !== 'SKIP') {
        const weight = this.getSeverityWeight(result.severity);
        totalWeight += weight;
        if (result.status === 'FAIL') {
          weightedFailures += weight;
        }
      }
    });

    return totalWeight > 0 ? Math.round((weightedFailures / totalWeight) * 100) : 0;
  }

  /**
   * Get severity weight for risk calculation
   */
  getSeverityWeight(severity) {
    const weights = {
      'low': 1,
      'medium': 2,
      'high': 3,
      'critical': 4
    };
    return weights[severity] || 1;
  }

  /**
   * Summarize input data for reporting
   */
  summarizeInputData(inputData) {
    return {
      data_sources: Object.keys(inputData),
      total_size: JSON.stringify(inputData).length,
      has_system_info: !!inputData.system_info,
      has_security_config: !!inputData.security_config,
      has_services: !!inputData.services,
      has_network: !!inputData.network
    };
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    const timestamp = Date.now().toString(36);
    const randomStr = Math.random().toString(36).substring(2, 8);
    return `session_${timestamp}_${randomStr}`;
  }

  /**
   * Get registered frameworks
   */
  getFrameworks() {
    return Array.from(this.frameworks.values());
  }

  /**
   * Get registered rules
   */
  getRules(frameworkCode = null) {
    if (frameworkCode) {
      return Array.from(this.rules.values()).filter(rule => rule.framework === frameworkCode);
    }
    return Array.from(this.rules.values());
  }
}

module.exports = RuleEngine;