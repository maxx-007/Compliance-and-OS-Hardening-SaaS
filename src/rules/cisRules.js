const logger = require('../utils/logger');

/**
 * CIS Benchmark Rules Implementation
 * Based on CIS Controls v8 and common Linux/Windows benchmarks
 */

const CIS_FRAMEWORK = {
  name: 'CIS Benchmarks',
  code: 'CIS',
  version: '8.0',
  description: 'Center for Internet Security Benchmarks'
};

const CIS_RULES = [
  {
    code: 'CIS-1.1.1',
    framework: 'CIS',
    title: 'Ensure mounting of cramfs filesystems is disabled',
    description: 'The cramfs filesystem type is a compressed read-only Linux filesystem embedded in small footprint systems.',
    category: 'Filesystem Configuration',
    severity: 'low',
    remediation: 'Edit /etc/modprobe.d/CIS.conf and add: install cramfs /bin/true',
    evaluate: async (inputData) => {
      const result = {
        passed: false,
        message: '',
        details: {},
        findings: [],
        evidence: {}
      };

      try {
        // Check if system configuration exists
        if (!inputData.security_config) {
          result.message = 'No security configuration data available';
          return result;
        }

        // Check for cramfs in loaded modules or filesystem config
        const services = inputData.services || {};
        const loadedModules = services.loaded_modules || [];
        
        const cramfsFound = loadedModules.some(module => 
          module.toLowerCase().includes('cramfs')
        );

        if (cramfsFound) {
          result.passed = false;
          result.message = 'cramfs filesystem is enabled/loaded';
          result.findings.push('cramfs module found in loaded modules');
          result.evidence.loaded_modules = loadedModules.filter(m => 
            m.toLowerCase().includes('cramfs')
          );
        } else {
          result.passed = true;
          result.message = 'cramfs filesystem is properly disabled';
        }

        result.details.checked_modules = loadedModules.length;
        return result;

      } catch (error) {
        throw new Error(`CIS-1.1.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'CIS-2.2.1',
    framework: 'CIS',
    title: 'Ensure X Window System is not installed',
    description: 'The X Window System provides a Graphical User Interface (GUI) where users can have multiple windows in which to run programs and various add on.',
    category: 'Services',
    severity: 'medium',
    remediation: 'Remove X Window System packages: yum groupremove "X Window System"',
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

        // Check for X11/GUI related services
        const guiServices = ['gdm', 'lightdm', 'xdm', 'kdm', 'x11', 'xorg'];
        const foundGuiServices = [];

        [...runningServices, ...enabledServices].forEach(service => {
          if (guiServices.some(gui => service.toLowerCase().includes(gui))) {
            foundGuiServices.push(service);
          }
        });

        if (foundGuiServices.length > 0) {
          result.passed = false;
          result.message = `X Window System components found: ${foundGuiServices.join(', ')}`;
          result.findings = foundGuiServices.map(service => `GUI service found: ${service}`);
          result.evidence.gui_services = foundGuiServices;
        } else {
          result.passed = true;
          result.message = 'X Window System is not installed or running';
        }

        result.details.total_services_checked = runningServices.length + enabledServices.length;
        return result;

      } catch (error) {
        throw new Error(`CIS-2.2.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'CIS-5.2.1',
    framework: 'CIS',
    title: 'Ensure permissions on /etc/ssh/sshd_config are configured',
    description: 'The /etc/ssh/sshd_config file contains configuration specifications for sshd.',
    category: 'SSH Configuration',
    severity: 'high',
    remediation: 'Run: chown root:root /etc/ssh/sshd_config && chmod og-rwx /etc/ssh/sshd_config',
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
        const ssh = securityConfig.ssh || {};

        // Check SSH configuration
        if (!ssh || Object.keys(ssh).length === 0) {
          result.message = 'SSH configuration not found';
          result.findings.push('SSH configuration missing from input data');
          return result;
        }

        // Check for secure SSH settings
        const issues = [];
        
        if (ssh.root_login !== 'no') {
          issues.push('Root login is not disabled');
        }

        if (ssh.password_authentication === 'yes' && !ssh.pubkey_authentication) {
          issues.push('Password authentication enabled without public key authentication');
        }

        if (!ssh.port || ssh.port === 22) {
          issues.push('SSH running on default port 22');
        }

        if (ssh.permit_empty_passwords === 'yes') {
          issues.push('Empty passwords are permitted');
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `SSH configuration issues found: ${issues.length}`;
          result.findings = issues;
          result.evidence.ssh_config = ssh;
        } else {
          result.passed = true;
          result.message = 'SSH configuration follows security best practices';
        }

        result.details.ssh_settings_checked = Object.keys(ssh).length;
        return result;

      } catch (error) {
        throw new Error(`CIS-5.2.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'CIS-5.2.4',
    framework: 'CIS',
    title: 'Ensure SSH root login is disabled',
    description: 'The PermitRootLogin parameter specifies if the root user can log in using ssh.',
    category: 'SSH Configuration',
    severity: 'critical',
    remediation: 'Edit /etc/ssh/sshd_config and set: PermitRootLogin no',
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
        const ssh = securityConfig.ssh || {};

        if (!ssh.hasOwnProperty('root_login')) {
          result.message = 'SSH root login setting not found in configuration';
          result.findings.push('PermitRootLogin setting missing');
          return result;
        }

        if (ssh.root_login === 'no') {
          result.passed = true;
          result.message = 'SSH root login is properly disabled';
        } else {
          result.passed = false;
          result.message = `SSH root login is enabled: ${ssh.root_login}`;
          result.findings.push(`PermitRootLogin is set to: ${ssh.root_login}`);
          result.evidence.current_setting = ssh.root_login;
        }

        result.details.ssh_config_available = Object.keys(ssh).length > 0;
        return result;

      } catch (error) {
        throw new Error(`CIS-5.2.4 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'CIS-5.3.1',
    framework: 'CIS',
    title: 'Ensure password creation requirements are configured',
    description: 'The pam_pwquality.so module checks the strength of passwords.',
    category: 'Password Policy',
    severity: 'high',
    remediation: 'Configure /etc/security/pwquality.conf with appropriate password requirements',
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
        const passwordPolicy = securityConfig.password_policy || {};

        if (!passwordPolicy || Object.keys(passwordPolicy).length === 0) {
          result.message = 'Password policy configuration not found';
          result.findings.push('Password policy settings missing');
          return result;
        }

        const issues = [];
        const recommendations = {
          min_length: 8,
          require_uppercase: true,
          require_lowercase: true,
          require_numbers: true,
          require_special_chars: true,
          max_age_days: 90
        };

        // Check minimum length
        if (!passwordPolicy.min_length || passwordPolicy.min_length < recommendations.min_length) {
          issues.push(`Minimum password length should be at least ${recommendations.min_length}`);
        }

        // Check character requirements
        if (!passwordPolicy.require_uppercase) {
          issues.push('Password should require uppercase characters');
        }

        if (!passwordPolicy.require_lowercase) {
          issues.push('Password should require lowercase characters');
        }

        if (!passwordPolicy.require_numbers) {
          issues.push('Password should require numeric characters');
        }

        if (!passwordPolicy.require_special_chars) {
          issues.push('Password should require special characters');
        }

        // Check password age
        if (!passwordPolicy.max_age_days || passwordPolicy.max_age_days > recommendations.max_age_days) {
          issues.push(`Password maximum age should be ${recommendations.max_age_days} days or less`);
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Password policy issues found: ${issues.length}`;
          result.findings = issues;
          result.evidence.current_policy = passwordPolicy;
          result.evidence.recommended_policy = recommendations;
        } else {
          result.passed = true;
          result.message = 'Password policy meets security requirements';
        }

        result.details.policy_settings_checked = Object.keys(passwordPolicy).length;
        return result;

      } catch (error) {
        throw new Error(`CIS-5.3.1 evaluation failed: ${error.message}`);
      }
    }
  },

  {
    code: 'CIS-3.5.1',
    framework: 'CIS',
    title: 'Ensure firewall is active',
    description: 'A firewall utility is required to configure the Linux kernel firewall.',
    category: 'Network Security',
    severity: 'critical',
    remediation: 'Enable and configure firewall: systemctl enable ufw && ufw enable',
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
        const firewall = securityConfig.firewall || {};
        const services = inputData.services || {};

        // Check if firewall is configured
        if (!firewall || Object.keys(firewall).length === 0) {
          result.message = 'Firewall configuration not found';
          result.findings.push('No firewall configuration detected');
          return result;
        }

        const issues = [];

        // Check firewall status
        if (firewall.status !== 'active') {
          issues.push(`Firewall status is: ${firewall.status || 'unknown'}`);
        }

        // Check default policies
        if (firewall.default_incoming !== 'deny') {
          issues.push(`Default incoming policy should be deny, currently: ${firewall.default_incoming}`);
        }

        // Check for firewall service running
        const runningServices = services.running || [];
        const firewallServices = ['ufw', 'iptables', 'firewalld'];
        const activeFirewallService = runningServices.find(service => 
          firewallServices.some(fw => service.toLowerCase().includes(fw))
        );

        if (!activeFirewallService) {
          issues.push('No active firewall service detected');
        }

        if (issues.length > 0) {
          result.passed = false;
          result.message = `Firewall configuration issues: ${issues.length}`;
          result.findings = issues;
          result.evidence.firewall_config = firewall;
          result.evidence.active_firewall_service = activeFirewallService;
        } else {
          result.passed = true;
          result.message = 'Firewall is properly configured and active';
        }

        result.details.firewall_rules_count = firewall.rules ? firewall.rules.length : 0;
        return result;

      } catch (error) {
        throw new Error(`CIS-3.5.1 evaluation failed: ${error.message}`);
      }
    }
  }
];

module.exports = {
  framework: CIS_FRAMEWORK,
  rules: CIS_RULES
};