# Compliance Audit Tool - Backend Setup

## Overview
Production-grade Node.js backend for the Compliance Audit Automation Tool with Express, MySQL, and MongoDB support.

## Features
- ✅ RESTful API with Express.js
- ✅ MySQL for structured data (users, rules, audit sessions)
- ✅ MongoDB for high-speed logs and configurations
- ✅ File upload support (JSON, TXT, LOG, CSV)
- ✅ Comprehensive logging with Winston
- ✅ Input validation with Joi
- ✅ Health check endpoints
- ✅ Production-ready error handling

## Quick Start

### Prerequisites
- Node.js 16+ 
- MySQL 8.0+
- MongoDB 5.0+

### Installation

1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
# Copy and edit .env file
cp .env .env.local
# Edit database credentials in .env.local
```

3. **Start databases:**
```bash
# MySQL (adjust for your system)
sudo systemctl start mysql

# MongoDB (adjust for your system)
sudo systemctl start mongod
```

4. **Run the server:**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Health Check
```http
GET /api/health
```
**Response:**
```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "service": "Compliance Audit Tool",
    "version": "1.0.0",
    "uptime": 3600,
    "databases": {
      "mysql": "connected",
      "mongodb": "connected"
    }
  }
}
```

### Upload JSON Data
```http
POST /api/upload/json
Content-Type: application/json
```
**Request Body:**
```json
{
  "data": {
    "system_info": {...},
    "security_config": {...}
  },
  "source": "system_scan",
  "type": "config",
  "metadata": {
    "scan_tool": "custom_scanner"
  }
}
```

### Upload Files
```http
POST /api/upload/files
Content-Type: multipart/form-data
```
**Form Data:**
- `files`: File(s) to upload (JSON, TXT, LOG, CSV)
- `source`: "manual" | "system_scan" | "log_file" | "cloud_scan"
- `type`: "config" | "logs" | "policies" | "scan_results"
- `description`: Optional description
- `metadata`: Optional JSON metadata

### Get Upload History
```http
GET /api/upload/history?page=1&limit=20
```

### Get Specific Upload
```http
GET /api/upload/{uploadId}
```

## Testing the API

### Using curl:

1. **Health Check:**
```bash
curl http://localhost:3000/api/health
```

2. **Upload JSON Data:**
```bash
curl -X POST http://localhost:3000/api/upload/json \
  -H "Content-Type: application/json" \
  -d @sample_test_data.json
```

3. **Upload File:**
```bash
curl -X POST http://localhost:3000/api/upload/files \
  -F "files=@sample_linux_output.json" \
  -F "source=system_scan" \
  -F "type=config" \
  -F "description=Linux system configuration"
```

### Using the provided test data:
The `sample_test_data.json` file contains three sample payloads:
- `sample_config_upload`: System configuration data
- `sample_log_upload`: Security log entries
- `sample_cloud_scan`: AWS cloud scan results

## Database Schema

### MySQL Tables
- **users**: User management and authentication
- **compliance_frameworks**: CIS, ISO 27001, RBI, SEBI frameworks
- **compliance_rules**: Individual compliance rules and logic
- **audit_sessions**: Audit execution tracking

### MongoDB Collections
- **system_logs**: Application and system logs
- **config_data**: Uploaded configuration files and data
- **scan_results**: Compliance scan results
- **audit_logs**: Detailed audit execution logs

## Project Structure
```
├── server.js                 # Main application entry point
├── package.json              # Dependencies and scripts
├── .env                      # Environment configuration
├── src/
│   ├── config/
│   │   ├── mysql.js          # MySQL connection and schema
│   │   └── mongodb.js        # MongoDB connection and collections
│   ├── routes/
│   │   ├── health.js         # Health check endpoints
│   │   └── upload.js         # File and data upload endpoints
│   └── utils/
│       └── logger.js         # Winston logging configuration
├── logs/                     # Application logs (auto-created)
└── sample_test_data.json     # Test data for API testing
```

## Environment Variables
```bash
# Server
PORT=3000
NODE_ENV=development

# MySQL
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_DATABASE=compliance_audit

# MongoDB
MONGODB_URI=mongodb://localhost:27017/compliance_logs

# Security
JWT_SECRET=your-super-secret-jwt-key

# Logging
LOG_LEVEL=info
```

## Next Steps
After confirming this backend works:
1. **Step 2**: Implement Rule Engine MVP with CIS and ISO 27001 checks
2. **Step 3**: Add PDF/JSON report generation
3. **Step 4**: Build React frontend dashboard
4. **Step 5**: Connect frontend to backend APIs
5. **Step 6**: Add RBI/SEBI rules and finishing touches

## Troubleshooting

### Database Connection Issues
1. Ensure MySQL and MongoDB are running
2. Check credentials in `.env` file
3. Verify database permissions
4. Check firewall settings

### File Upload Issues
1. Check file size limits (50MB max)
2. Verify file types (JSON, TXT, LOG, CSV only)
3. Ensure proper Content-Type headers

### Logs Location
- Application logs: `./logs/combined.log`
- Error logs: `./logs/error.log`
- Console output in development mode