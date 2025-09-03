const mysql = require('mysql2/promise');
const logger = require('../utils/logger');

let connection = null;

const connectMySQL = async () => {
  try {
    connection = await mysql.createConnection({
      host: process.env.MYSQL_HOST || 'localhost',
      port: process.env.MYSQL_PORT || 3306,
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'compliance_audit',
      charset: 'utf8mb4',
      connectTimeout: 5000,
      acquireTimeout: 5000
    });

    // Test connection
    await connection.ping();
    
    // Initialize database schema
    await initializeSchema();
    
    return connection;
  } catch (error) {
    logger.error('❌ MySQL connection failed:', error.message);
    throw error;
  }
};

const initializeSchema = async () => {
  try {
    // Create users table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role ENUM('admin', 'auditor', 'viewer') DEFAULT 'viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create compliance_frameworks table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS compliance_frameworks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(50) UNIQUE NOT NULL,
        description TEXT,
        version VARCHAR(50),
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Create compliance_rules table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS compliance_rules (
        id INT AUTO_INCREMENT PRIMARY KEY,
        framework_id INT NOT NULL,
        rule_code VARCHAR(100) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT,
        severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
        category VARCHAR(255),
        remediation TEXT,
        rule_logic JSON,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (framework_id) REFERENCES compliance_frameworks(id),
        UNIQUE KEY unique_rule (framework_id, rule_code)
      )
    `);

    // Create audit_sessions table
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS audit_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_name VARCHAR(255) NOT NULL,
        user_id INT,
        status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
        total_rules INT DEFAULT 0,
        passed_rules INT DEFAULT 0,
        failed_rules INT DEFAULT 0,
        risk_score DECIMAL(5,2) DEFAULT 0.00,
        started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Insert default frameworks
    await connection.execute(`
      INSERT IGNORE INTO compliance_frameworks (name, code, description, version) VALUES
      ('CIS Benchmarks', 'CIS', 'Center for Internet Security Benchmarks', '8.0'),
      ('ISO 27001', 'ISO27001', 'Information Security Management System', '2022'),
      ('RBI Guidelines', 'RBI', 'Reserve Bank of India Cybersecurity Guidelines', '2023'),
      ('SEBI CSCRF', 'SEBI', 'Securities and Exchange Board of India Cyber Security Framework', '2023')
    `);

    logger.info('✅ MySQL schema initialized successfully');
  } catch (error) {
    logger.error('❌ Failed to initialize MySQL schema:', error);
    throw error;
  }
};

const getConnection = () => {
  if (!connection) {
    logger.warn('MySQL connection not available');
    return null;
  }
  return connection;
};

module.exports = {
  connectMySQL,
  getConnection
};