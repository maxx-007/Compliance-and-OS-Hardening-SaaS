const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const moment = require('moment');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class ReportService {
  constructor() {
    // Chart functionality disabled for Windows compatibility
    this.chartsEnabled = false;
  }

  /**
   * Generate comprehensive compliance report
   */
  async generateReport(complianceResults, format = 'pdf', options = {}) {
    try {
      const {
        includeCharts = true,
        includeRemediation = true,
        includeEvidence = false,
        companyName = 'Organization',
        reportTitle = 'Compliance Audit Report'
      } = options;

      // Enhance results with additional analysis
      const enhancedResults = await this.enhanceResults(complianceResults);

      // Generate charts if requested and available
      let charts = {};
      if (includeCharts && this.chartsEnabled) {
        charts = await this.generateCharts(enhancedResults);
      } else if (includeCharts) {
        logger.warn('Charts requested but not available - continuing without charts');
      }

      // Prepare report data
      const reportData = {
        ...enhancedResults,
        charts,
        metadata: {
          companyName,
          reportTitle,
          generatedAt: moment().format('MMMM Do YYYY, h:mm:ss a'),
          generatedBy: 'Compliance Audit Tool v1.0',
          includeRemediation,
          includeEvidence
        }
      };

      // Generate report based on format
      switch (format.toLowerCase()) {
        case 'pdf':
          return await this.generatePDFReport(reportData);
        case 'json':
          return await this.generateJSONReport(reportData);
        case 'html':
          return await this.generateHTMLReport(reportData);
        default:
          throw new Error(`Unsupported report format: ${format}`);
      }

    } catch (error) {
      logger.error('Report generation failed:', error);
      throw error;
    }
  }

  /**
   * Enhance compliance results with additional analysis
   */
  async enhanceResults(results) {
    const enhanced = { ...results };

    // Calculate enhanced risk metrics
    enhanced.risk_analysis = this.calculateRiskAnalysis(results);
    
    // Categorize findings by severity
    enhanced.findings_by_severity = this.categorizeFindingsBySeverity(results);
    
    // Generate remediation priority
    enhanced.remediation_priority = this.generateRemediationPriority(results);
    
    // Calculate compliance trends (if historical data available)
    enhanced.compliance_trends = await this.calculateComplianceTrends(results);
    
    // Generate executive summary
    enhanced.executive_summary = this.generateExecutiveSummary(results);

    return enhanced;
  }

  /**
   * Calculate detailed risk analysis
   */
  calculateRiskAnalysis(results) {
    const analysis = {
      overall_risk_level: this.getRiskLevel(results.overall_risk_score),
      framework_risks: {},
      category_risks: {},
      severity_distribution: {
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      },
      top_risks: [],
      risk_factors: []
    };

    // Analyze framework-specific risks
    Object.entries(results.framework_results).forEach(([framework, data]) => {
      analysis.framework_risks[framework] = {
        risk_level: this.getRiskLevel(data.risk_score),
        risk_score: data.risk_score,
        compliance_percentage: data.compliance_percentage,
        critical_failures: data.rule_results.filter(r => 
          r.status === 'FAIL' && r.severity === 'critical'
        ).length
      };
    });

    // Analyze category risks
    const categoryMap = {};
    results.detailed_results.forEach(rule => {
      if (!categoryMap[rule.category]) {
        categoryMap[rule.category] = { total: 0, failed: 0, critical: 0 };
      }
      categoryMap[rule.category].total++;
      if (rule.status === 'FAIL') {
        categoryMap[rule.category].failed++;
        if (rule.severity === 'critical') {
          categoryMap[rule.category].critical++;
        }
      }
      analysis.severity_distribution[rule.severity]++;
    });

    Object.entries(categoryMap).forEach(([category, data]) => {
      analysis.category_risks[category] = {
        failure_rate: Math.round((data.failed / data.total) * 100),
        critical_issues: data.critical,
        risk_level: this.getRiskLevel((data.failed / data.total) * 100)
      };
    });

    // Identify top risks
    analysis.top_risks = results.detailed_results
      .filter(rule => rule.status === 'FAIL')
      .sort((a, b) => {
        const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        return severityWeight[b.severity] - severityWeight[a.severity];
      })
      .slice(0, 5)
      .map(rule => ({
        rule_code: rule.rule_code,
        title: rule.rule_title,
        severity: rule.severity,
        category: rule.category,
        impact: this.calculateRuleImpact(rule)
      }));

    // Generate risk factors
    if (results.overall_risk_score > 70) {
      analysis.risk_factors.push('High overall risk score indicates significant security gaps');
    }
    if (analysis.severity_distribution.critical > 0) {
      analysis.risk_factors.push(`${analysis.severity_distribution.critical} critical security issues require immediate attention`);
    }
    if (results.failed_rules > results.passed_rules) {
      analysis.risk_factors.push('More rules failed than passed, indicating systemic security issues');
    }

    return analysis;
  }

  /**
   * Categorize findings by severity
   */
  categorizeFindingsBySeverity(results) {
    const categories = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };

    results.detailed_results.forEach(rule => {
      if (rule.status === 'FAIL') {
        categories[rule.severity].push({
          rule_code: rule.rule_code,
          title: rule.rule_title,
          category: rule.category,
          message: rule.message,
          findings: rule.findings || [],
          remediation: rule.remediation
        });
      }
    });

    return categories;
  }

  /**
   * Generate remediation priority list
   */
  generateRemediationPriority(results) {
    const priorities = [];
    const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };

    results.detailed_results
      .filter(rule => rule.status === 'FAIL')
      .forEach(rule => {
        const priority = {
          priority_level: this.calculatePriorityLevel(rule),
          rule_code: rule.rule_code,
          title: rule.rule_title,
          severity: rule.severity,
          category: rule.category,
          estimated_effort: this.estimateRemediationEffort(rule),
          business_impact: this.assessBusinessImpact(rule),
          remediation: rule.remediation,
          findings: rule.findings || []
        };
        priorities.push(priority);
      });

    // Sort by priority (critical first, then by business impact)
    priorities.sort((a, b) => {
      const aWeight = severityWeight[a.severity] * a.business_impact;
      const bWeight = severityWeight[b.severity] * b.business_impact;
      return bWeight - aWeight;
    });

    return priorities;
  }

  /**
   * Calculate compliance trends (placeholder for historical data)
   */
  async calculateComplianceTrends(results) {
    // In a real implementation, this would query historical data
    return {
      trend_direction: 'stable',
      previous_score: null,
      improvement_areas: [],
      regression_areas: [],
      note: 'Historical data not available for trend analysis'
    };
  }

  /**
   * Generate executive summary
   */
  generateExecutiveSummary(results) {
    const summary = {
      overall_status: this.getOverallStatus(results),
      key_findings: [],
      recommendations: [],
      next_steps: []
    };

    // Key findings
    if (results.overall_risk_score > 70) {
      summary.key_findings.push('High risk score indicates significant security vulnerabilities');
    }
    if (results.passed_rules < results.failed_rules) {
      summary.key_findings.push('More compliance rules failed than passed');
    }

    // Framework-specific findings
    Object.entries(results.framework_results).forEach(([framework, data]) => {
      if (data.compliance_percentage < 50) {
        summary.key_findings.push(`${framework} compliance is below acceptable threshold (${data.compliance_percentage}%)`);
      }
    });

    // Recommendations
    const criticalIssues = results.detailed_results.filter(r => 
      r.status === 'FAIL' && r.severity === 'critical'
    ).length;

    if (criticalIssues > 0) {
      summary.recommendations.push(`Address ${criticalIssues} critical security issues immediately`);
    }

    summary.recommendations.push('Implement regular compliance monitoring');
    summary.recommendations.push('Establish remediation timeline based on risk priority');

    // Next steps
    summary.next_steps.push('Review and approve remediation plan');
    summary.next_steps.push('Assign responsible teams for each remediation item');
    summary.next_steps.push('Schedule follow-up compliance assessment');

    return summary;
  }

  /**
   * Generate charts for visual representation (placeholder for future implementation)
   */
  async generateCharts(results) {
    // Charts disabled for Windows compatibility
    // Future implementation could use server-side chart generation
    logger.info('Chart generation skipped - feature disabled for compatibility');
    return {};
  }

  /**
   * Generate PDF report
   */
  async generatePDFReport(reportData) {
    const htmlContent = await this.generateHTMLReport(reportData);
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
      const page = await browser.newPage();
      await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
      
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20mm',
          right: '15mm',
          bottom: '20mm',
          left: '15mm'
        }
      });

      return {
        format: 'pdf',
        content: pdfBuffer,
        filename: `compliance-report-${moment().format('YYYY-MM-DD-HHmm')}.pdf`,
        size: pdfBuffer.length
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Generate HTML report
   */
  async generateHTMLReport(reportData) {
    const templatePath = path.join(__dirname, '../templates/report-template.hbs');
    
    try {
      const templateContent = await fs.readFile(templatePath, 'utf8');
      const template = handlebars.compile(templateContent);
      return template(reportData);
    } catch (error) {
      // Fallback to inline template if file doesn't exist
      return this.generateInlineHTMLReport(reportData);
    }
  }

  /**
   * Generate JSON report
   */
  async generateJSONReport(reportData) {
    return {
      format: 'json',
      content: JSON.stringify(reportData, null, 2),
      filename: `compliance-report-${moment().format('YYYY-MM-DD-HHmm')}.json`,
      size: JSON.stringify(reportData).length
    };
  }

  /**
   * Helper methods
   */
  getRiskLevel(score) {
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  }

  getOverallStatus(results) {
    const complianceRate = (results.passed_rules / (results.total_rules - results.skipped_rules)) * 100;
    if (complianceRate >= 80) return 'Good';
    if (complianceRate >= 60) return 'Acceptable';
    return 'Needs Improvement';
  }

  calculateRuleImpact(rule) {
    const severityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityWeight[rule.severity] || 1;
  }

  calculatePriorityLevel(rule) {
    if (rule.severity === 'critical') return 'Immediate';
    if (rule.severity === 'high') return 'High';
    if (rule.severity === 'medium') return 'Medium';
    return 'Low';
  }

  estimateRemediationEffort(rule) {
    // Simple heuristic based on rule category and severity
    const effortMap = {
      'SSH Configuration': 'Low',
      'Password Policy': 'Medium',
      'Network Security': 'High',
      'Access Control': 'Medium',
      'Logging and Monitoring': 'High'
    };
    return effortMap[rule.category] || 'Medium';
  }

  assessBusinessImpact(rule) {
    const severityImpact = { critical: 4, high: 3, medium: 2, low: 1 };
    return severityImpact[rule.severity] || 1;
  }

  /**
   * Inline HTML template as fallback
   */
  generateInlineHTMLReport(reportData) {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>${reportData.metadata.reportTitle}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; }
        .summary { background: #f5f5f5; padding: 15px; margin: 20px 0; border-radius: 5px; }
        .framework { margin: 20px 0; border: 1px solid #ddd; padding: 15px; }
        .risk-high { color: #dc2626; font-weight: bold; }
        .risk-medium { color: #f59e0b; font-weight: bold; }
        .risk-low { color: #10b981; font-weight: bold; }
        .chart { text-align: center; margin: 20px 0; }
        .findings { margin: 10px 0; }
        .finding { background: #fef2f2; border-left: 4px solid #ef4444; padding: 10px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${reportData.metadata.reportTitle}</h1>
        <h2>${reportData.metadata.companyName}</h2>
        <p>Generated: ${reportData.metadata.generatedAt}</p>
        <p>Session ID: ${reportData.session_id}</p>
    </div>

    <div class="summary">
        <h2>Executive Summary</h2>
        <p><strong>Overall Risk Score:</strong> <span class="risk-${reportData.risk_analysis.overall_risk_level.toLowerCase()}">${reportData.overall_risk_score}% (${reportData.risk_analysis.overall_risk_level})</span></p>
        <p><strong>Compliance Status:</strong> ${reportData.passed_rules}/${reportData.total_rules} rules passed</p>
        <p><strong>Frameworks Tested:</strong> ${reportData.frameworks_tested.join(', ')}</p>
    </div>

    ${Object.entries(reportData.framework_results).map(([framework, data]) => `
    <div class="framework">
        <h3>${data.framework}</h3>
        <p><strong>Compliance:</strong> ${data.compliance_percentage}%</p>
        <p><strong>Risk Score:</strong> ${data.risk_score}%</p>
        <p><strong>Results:</strong> ${data.passed} passed, ${data.failed} failed</p>
    </div>
    `).join('')}

    <div class="findings">
        <h2>Critical Issues</h2>
        ${reportData.findings_by_severity.critical.map(finding => `
        <div class="finding">
            <h4>${finding.rule_code}: ${finding.title}</h4>
            <p>${finding.message}</p>
            <p><strong>Remediation:</strong> ${finding.remediation}</p>
        </div>
        `).join('')}
    </div>

    <div class="findings">
        <h2>Remediation Priority</h2>
        <ol>
        ${reportData.remediation_priority.slice(0, 10).map(item => `
            <li>
                <strong>${item.rule_code}</strong> - ${item.title}
                <br><small>Severity: ${item.severity} | Effort: ${item.estimated_effort}</small>
                <br>${item.remediation}
            </li>
        `).join('')}
        </ol>
    </div>
</body>
</html>`;
  }
}

module.exports = new ReportService();