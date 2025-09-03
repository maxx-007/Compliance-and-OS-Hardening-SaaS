const logger = require('../utils/logger');

/**
 * ISO 27001 Rules Implementation
 * Based on ISO/IEC 27001:2022 Information Security Management System
 */

const ISO27001_FRAMEWORK = {
  name: 'ISO 27001',
  code: 'ISO27001',
  version: '2022',
  description: 'Information Security Management System'
};

const ISO27001_RULES = [
  {
    code: 'ISO-A.9.1.1',
    framework: 'ISO27001',
    title: 'Access control policy',
    description: 'An access control policy shall be established, documented and reviewed based on business and information security requirements.',
    category: 'Access Control',
    severity: 'high',
    remediation: 'Establish and document comprehensive access control policies covering user access management, privileged access, and regular access reviews.',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        const securityConfig = inputData.security_config || {};
        const users = securityConfig.users || [];

        if (users.length === 0) {
          result.message = 'No user access information available';
          result.findings.push('User access data missing');
          return result;
        }

        const issues = [];
        let privilegedUsers = 0;
        let regularUsers = 0;
        const userAnalysis = [];

        users.forEach(user => {
          const userInfo = {
            username: user.username,
            groups: user.groups || [],
            shell: user.shell,
            privileged: false
          };

          // Check for privileged access
          const privilegedGroups = ['root', 'sudo', 'admin', 'wheel'];
          const hasPrivilegedAccess = user.groups && user.groups.some(group => 
            privilegedGroups.includes(group.toLowerCase())
          );

          if (hasPrivilegedAccess) {
            privilegedUsers++;
            userInfo.privileged = true;
          } else {
            regularUsers++;
          }

          // Check for risky configurations
          if (user.shell === '/bin/bash' && !hasPrivilegedAccess) {
            issues.push(`User ${user.username} has shell access without clear business justification`);
          }

          if (user.username === 'guest' && user.shell !== '/bin/false') {
            issues.push(`Guest account has active shell access`);
          }

          userAnalysis.push(userInfo);
        });

        // Check privileged user ratio
        const privilegedRatio = (privilegedUsers / users.length) * 100;
        if (privilegedRatio > 20) {
          issues.push(`High percentage of privileged users: ${privilegedRatio.toFixed(1)}%`);
        }

        // Check for proper access segregation
        if (privilegedUsers === 0) {
          issues.push('No privileged users found - administrative access may not be properly managed');
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Access control policy violations found: ${issues.length}`;
          result.findings = issues;
          result.evidence.user_analysis = userAnalysis;
          result.evidence.privileged_users_count = privilegedUsers;
          result.evidence.regular_users_count = regularUsers;
        } else {
          result.passed = true;
          result.message = 'Access control policy appears to be properly implemented';
        }

        result.details.total_users = users.length;
        result.details.privileged_users = privilegedUsers;
        result.details.privileged_ratio = privilegedRatio;

        return result;

      } catch (error) {
        throw new Error(`ISO-A.9.1.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'ISO-A.12.4.1',
    framework: 'ISO27001',
    title: 'Event logging',
    description: 'Event logs recording user activities, exceptions, faults and information security events shall be produced, kept and regularly reviewed.',
    category: 'Logging and Monitoring',
    severity: 'high',
    remediation: 'Implement comprehensive logging for security events, user activities, and system exceptions. Ensure logs are regularly reviewed and retained appropriately.',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        const services = inputData.services || {};
        const runningServices = services.running || [];
        const enabledServices = services.enabled || [];

        // Check for logging services
        const loggingServices = ['rsyslog', 'syslog-ng', 'journald', 'auditd'];
        const activeLoggingServices = [];

        [...runningServices, ...enabledServices].forEach(service => {
          if (loggingServices.some(logService => 
            service.toLowerCase().includes(logService.toLowerCase())
          )) {
            activeLoggingServices.push(service);
          }
        });

        const issues = [];

        if (activeLoggingServices.length === 0) {
          issues.push('No active logging services detected');
        }

        // Check for audit daemon specifically
        const auditServiceActive = activeLoggingServices.some(service => 
          service.toLowerCase().includes('audit')
        );

        if (!auditServiceActive) {
          issues.push('Audit daemon (auditd) not detected - security event logging may be insufficient');
        }

        // Check network configuration for log forwarding
        const network = inputData.network || {};
        const listeningServices = network.listening_services || [];
        
        const logForwardingPorts = [514, 6514]; // syslog ports
        const hasLogForwarding = listeningServices.some(service => 
          logForwardingPorts.includes(service.port)
        );

        if (!hasLogForwarding) {
          issues.push('No log forwarding configuration detected');
        }

        // Check for log rotation and management
        const logManagementServices = ['logrotate', 'rsyslog'];
        const hasLogManagement = runningServices.some(service =>
          logManagementServices.some(logMgmt => 
            service.toLowerCase().includes(logMgmt)
          )
        );

        if (!hasLogManagement) {
          issues.push('Log rotation and management services not detected');
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Logging configuration issues found: ${issues.length}`;
          result.findings = issues;
          result.evidence.active_logging_services = activeLoggingServices;
          result.evidence.listening_services = listeningServices;
        } else {
          result.passed = true;
          result.message = 'Event logging appears to be properly configured';
        }

        result.details.logging_services_found = activeLoggingServices.length;
        result.details.total_services_checked = runningServices.length + enabledServices.length;

        return result;

      } catch (error) {
        throw new Error(`ISO-A.12.4.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'ISO-A.13.1.1',
    framework: 'ISO27001',
    title: 'Network controls',
    description: 'Networks shall be controlled and protected to protect information in systems and applications.',
    category: 'Network Security',
    severity: 'critical',
    remediation: 'Implement network segmentation, access controls, and monitoring. Configure firewalls and intrusion detection systems.',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        const network = inputData.network || {};
        const securityConfig = inputData.security_config || {};
        const firewall = securityConfig.firewall || {};

        const issues = [];

        // Check network interfaces
        const interfaces = network.interfaces || [];
        if (interfaces.length === 0) {
          issues.push('No network interface information available');
        }

        // Check for public interfaces
        const publicInterfaces = interfaces.filter(iface => 
          !iface.ip.startsWith('127.') && 
          !iface.ip.startsWith('192.168.') && 
          !iface.ip.startsWith('10.') &&
          !iface.ip.startsWith('172.')
        );

        if (publicInterfaces.length > 0 && (!firewall || Object.keys(firewall).length === 0)) {
          issues.push('Public network interfaces detected without firewall configuration');
        }

        // Check open ports
        const openPorts = network.open_ports || [];
        const riskyPorts = [21, 23, 135, 139, 445, 1433, 3389]; // FTP, Telnet, SMB, RDP, etc.
        const foundRiskyPorts = openPorts.filter(port => riskyPorts.includes(port));

        if (foundRiskyPorts.length > 0) {
          issues.push(`Risky ports open: ${foundRiskyPorts.join(', ')}`);
        }

        // Check for excessive open ports
        if (openPorts.length > 10) {
          issues.push(`Large number of open ports detected: ${openPorts.length}`);
        }

        // Check firewall rules
        if (firewall.rules) {
          const allowAllRules = firewall.rules.filter(rule => 
            rule.source === 'any' || rule.source === '0.0.0.0/0'
          );

          if (allowAllRules.length > 3) {
            issues.push(`Too many permissive firewall rules: ${allowAllRules.length}`);
          }
        }

        // Check for network monitoring
        const services = inputData.services || {};
        const runningServices = services.running || [];
        const monitoringServices = ['fail2ban', 'snort', 'suricata'];
        const hasNetworkMonitoring = runningServices.some(service =>
          monitoringServices.some(monitor => 
            service.toLowerCase().includes(monitor)
          )
        );

        if (!hasNetworkMonitoring) {
          issues.push('No network monitoring/intrusion detection services detected');
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Network security issues found: ${issues.length}`;
          result.findings = issues;
          result.evidence.open_ports = openPorts;
          result.evidence.risky_ports = foundRiskyPorts;
          result.evidence.public_interfaces = publicInterfaces;
          result.evidence.firewall_rules_count = firewall.rules ? firewall.rules.length : 0;
        } else {
          result.passed = true;
          result.message = 'Network controls appear to be properly implemented';
        }

        result.details.interfaces_count = interfaces.length;
        result.details.open_ports_count = openPorts.length;
        result.details.firewall_configured = Object.keys(firewall).length > 0;

        return result;

      } catch (error) {
        throw new Error(`ISO-A.13.1.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'ISO-A.8.2.1',
    framework: 'ISO27001',
    title: 'Information classification',
    description: 'Information shall be classified in terms of legal requirements, value, criticality and sensitivity to unauthorized disclosure or modification.',
    category: 'Information Security',
    severity: 'medium',
    remediation: 'Implement information classification scheme and ensure proper handling of classified information based on sensitivity levels.',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        // This rule checks for evidence of information classification in system configuration
        const securityConfig = inputData.security_config || {};
        const services = inputData.services || {};
        const runningServices = services.running || [];

        const issues = [];

        // Check for data protection services
        const dataProtectionServices = ['gpg', 'openssl', 'cryptsetup'];
        const activeDataProtection = runningServices.filter(service =>
          dataProtectionServices.some(dp => 
            service.toLowerCase().includes(dp)
          )
        );

        if (activeDataProtection.length === 0) {
          issues.push('No data encryption/protection services detected');
        }

        // Check for backup and archival services
        const backupServices = ['rsync', 'tar', 'backup'];
        const activeBackupServices = runningServices.filter(service =>
          backupServices.some(backup => 
            service.toLowerCase().includes(backup)
          )
        );

        if (activeBackupServices.length === 0) {
          issues.push('No backup services detected for data protection');
        }

        // Check file system permissions and access controls
        const users = securityConfig.users || [];
        if (users.length > 0) {
          const systemUsers = users.filter(user => 
            user.uid < 1000 && user.username !== 'root'
          );
          
          if (systemUsers.length === 0) {
            issues.push('No system service accounts detected - may indicate improper privilege separation');
          }
        }

        // Check for database services (often contain classified information)
        const databaseServices = ['mysql', 'postgresql', 'mongodb', 'redis'];
        const activeDatabases = runningServices.filter(service =>
          databaseServices.some(db => 
            service.toLowerCase().includes(db)
          )
        );

        if (activeDatabases.length > 0) {
          // Check if databases are properly secured
          const network = inputData.network || {};
          const listeningServices = network.listening_services || [];
          
          const exposedDatabases = listeningServices.filter(service =>
            databaseServices.some(db => 
              service.service && service.service.toLowerCase().includes(db)
            )
          );

          if (exposedDatabases.length > 0) {
            issues.push(`Database services exposed on network: ${exposedDatabases.map(s => s.service).join(', ')}`);
          }
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Information classification and protection issues: ${issues.length}`;
          result.findings = issues;
          result.evidence.data_protection_services = activeDataProtection;
          result.evidence.backup_services = activeBackupServices;
          result.evidence.database_services = activeDatabases;
        } else {
          result.passed = true;
          result.message = 'Information classification controls appear adequate';
        }

        result.details.data_protection_services = activeDataProtection.length;
        result.details.database_services = activeDatabases.length;

        return result;

      } catch (error) {
        throw new Error(`ISO-A.8.2.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'ISO-A.12.6.1',
    framework: 'ISO27001',
    title: 'Management of technical vulnerabilities',
    description: 'Information about technical vulnerabilities of information systems being used shall be obtained in a timely fashion.',
    category: 'Vulnerability Management',
    severity: 'high',
    remediation: 'Implement vulnerability scanning, patch management, and regular security updates. Monitor security advisories and maintain an inventory of systems.',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        const systemInfo = inputData.system_info || {};
        const services = inputData.services || {};
        const runningServices = services.running || [];

        const issues = [];

        // Check system information availability
        if (!systemInfo.os || !systemInfo.kernel) {
          issues.push('Insufficient system information for vulnerability assessment');
        }

        // Check for security update services
        const updateServices = ['unattended-upgrades', 'yum-cron', 'dnf-automatic'];
        const hasAutoUpdates = runningServices.some(service =>
          updateServices.some(update => 
            service.toLowerCase().includes(update)
          )
        );

        if (!hasAutoUpdates) {
          issues.push('No automatic security update services detected');
        }

        // Check for vulnerability scanning tools
        const vulnScanners = ['nessus', 'openvas', 'lynis', 'rkhunter', 'chkrootkit'];
        const hasVulnScanner = runningServices.some(service =>
          vulnScanners.some(scanner => 
            service.toLowerCase().includes(scanner)
          )
        );

        if (!hasVulnScanner) {
          issues.push('No vulnerability scanning tools detected');
        }

        // Check for intrusion detection
        const idsServices = ['aide', 'tripwire', 'samhain'];
        const hasIDS = runningServices.some(service =>
          idsServices.some(ids => 
            service.toLowerCase().includes(ids)
          )
        );

        if (!hasIDS) {
          issues.push('No file integrity monitoring/intrusion detection services detected');
        }

        // Check for monitoring and alerting
        const monitoringServices = ['nagios', 'zabbix', 'prometheus', 'collectd'];
        const hasMonitoring = runningServices.some(service =>
          monitoringServices.some(monitor => 
            service.toLowerCase().includes(monitor)
          )
        );

        if (!hasMonitoring) {
          issues.push('No system monitoring services detected');
        }

        // Analyze running services for known risky services
        const riskyServices = ['telnet', 'ftp', 'rsh', 'rlogin'];
        const foundRiskyServices = runningServices.filter(service =>
          riskyServices.some(risky => 
            service.toLowerCase().includes(risky)
          )
        );

        if (foundRiskyServices.length > 0) {
          issues.push(`Insecure services detected: ${foundRiskyServices.join(', ')}`);
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Vulnerability management issues found: ${issues.length}`;
          result.findings = issues;
          result.evidence.risky_services = foundRiskyServices;
          result.evidence.system_info = systemInfo;
        } else {
          result.passed = true;
          result.message = 'Vulnerability management controls appear to be in place';
        }

        result.details.total_services = runningServices.length;
        result.details.has_auto_updates = hasAutoUpdates;
        result.details.has_vulnerability_scanner = hasVulnScanner;
        result.details.has_monitoring = hasMonitoring;

        return result;

      } catch (error) {
        throw new Error(`ISO-A.12.6.1 evaluation failed: ${error.message}`);
      }
    }
  }
];

module.exports = {
  framework: ISO27001_FRAMEWORK,
  rules: ISO27001_RULES
};