# WhatsApp AI Bot API

A multi-tenant WhatsApp AI Bot API with business management capabilities. Each business can have its own WhatsApp configuration and AI response tones.

## 🚀 Features

- **Multi-Tenant Architecture**: Each company has its own WhatsApp number and configuration
- **WhatsApp Business API Integration**: Send and receive messages via WhatsApp Business Cloud API
- **AI-Powered Responses**: OpenAI GPT-4 integration with customizable business tones
- **Media Support**: Handle text, images, and audio messages
- **Business Management**: CRUD operations for businesses, WhatsApp configs, and AI tones
- **Database Storage**: PostgreSQL backend with proper data isolation
- **RESTful API**: Clean, documented API endpoints for frontend integration

## 📁 Project Structure

```
backend/
├── config/                 # Database configuration
├── routes/                 # API route definitions
│   ├── business.js        # Business management endpoints
│   └── whatsapp.js        # WhatsApp webhook endpoints
├── services/               # Business logic services
│   ├── business.js        # Business CRUD operations
│   ├── database.js        # Database operations
│   ├── openai.js          # OpenAI API integration
│   └── whatsapp.js        # WhatsApp API integration
├── scripts/                # Database and utility scripts
│   ├── init-database.js   # Database initialization
│   ├── migrate-database.js # Database migration
│   └── cleanup-media.js   # Media cleanup utility
├── uploads/                # Media file storage
│   ├── images/            # Image files
│   └── audio/             # Audio files
├── server.js               # Main Express server
├── package.json            # Dependencies and scripts
├── .env.example           # Environment configuration template
├── API_DOCUMENTATION.md   # Complete API documentation
└── README.md              # This file
```

## 🛠️ Prerequisites

- Node.js 16+ and npm 8+
- PostgreSQL 12+
- OpenAI API key
- WhatsApp Business API credentials

## 🚀 Quick Start

### 1. Clone and Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
```

### 2. Environment Configuration

Edit `.env` file with your configuration:

```bash
# Server Configuration
PORT=8000
NODE_ENV=development
FRONTEND_URL=http://localhost:8080

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_bot
DB_USER=your_db_user
DB_PASSWORD=your_db_password

# OpenAI Configuration
OPENAI_API_KEY=your_openai_api_key
```

### 3. Database Setup

```bash
# Initialize database schema
npm run init-db

# Run migrations (if upgrading existing database)
npm run migrate-db
```

### 4. Start the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

### 5. Verify Installation

```bash
# Health check
curl http://localhost:8000/health

# Test API
curl http://localhost:8000/api/businesses
```

## 🔌 API Endpoints

### Core Endpoints

- **`GET /health`** - Health check and status
- **`GET /webhook`** - WhatsApp webhook verification
- **`POST /webhook`** - WhatsApp message reception

### Business Management API

- **`GET /api/businesses`** - List all businesses
- **`POST /api/businesses`** - Create new business
- **`GET /api/businesses/:id`** - Get business details
- **`PUT /api/businesses/:id`** - Update business
- **`DELETE /api/businesses/:id`** - Delete business

### WhatsApp Configuration API

- **`GET /api/businesses/:businessId/whatsapp-config`** - Get WhatsApp config
- **`POST /api/businesses/:businessId/whatsapp-config`** - Create WhatsApp config
- **`PUT /api/whatsapp-config/:id`** - Update WhatsApp config
- **`DELETE /api/whatsapp-config/:id`** - Delete WhatsApp config

### Business Tones API

- **`GET /api/businesses/:businessId/tones`** - List business tones
- **`POST /api/businesses/:businessId/tones`** - Create new tone
- **`PUT /api/tones/:id`** - Update tone
- **`DELETE /api/tones/:id`** - Delete tone

## 🔗 Frontend Integration

This API is designed to work with independent frontend applications. See `API_DOCUMENTATION.md` for complete integration details.

### Basic Frontend Setup

```javascript
const API_BASE = "http://localhost:8000/api";

// Example: Get all businesses
const getBusinesses = async () => {
  const response = await fetch(`${API_BASE}/businesses`);
  const result = await response.json();
  return result.success ? result.data : [];
};
```

### CORS Configuration

The API is configured to accept requests from:

- Development: `http://localhost:8080` (configurable)
- Production: Set via `FRONTEND_URL` environment variable

## 📊 Database Schema

### Core Tables

- **`businesses`** - Business information
- **`whatsapp_configs`** - WhatsApp API configurations
- **`business_tones`** - AI response tone configurations
- **`conversations`** - Chat conversations
- **`messages`** - Individual messages
- **`media_files`** - Media file metadata

### Key Relationships

- Each business can have one WhatsApp configuration
- Each business can have multiple AI tones
- Conversations and messages are linked to businesses
- Media files are linked to messages

## 🔧 Development

### Available Scripts

```bash
npm run dev              # Start development server
npm run start            # Start production server
npm run init-db          # Initialize database
npm run migrate-db       # Run database migrations
npm run cleanup          # Clean up media files
npm run health           # Check API health
```

### Code Structure

- **Routes**: Handle HTTP requests and responses
- **Services**: Business logic and external API calls
- **Config**: Database and environment configuration
- **Scripts**: Database management and utilities

## 🚀 Production Deployment

### Environment Variables

```bash
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
API_BASE_URL=https://yourdomain.com/media
DB_HOST=your_db_host
DB_PASSWORD=your_secure_password
```

### Security Considerations

- Implement proper authentication and authorization
- Use HTTPS in production
- Configure proper CORS origins
- Set up rate limiting
- Monitor API usage and logs

### Scaling

- Use connection pooling for database
- Implement caching for frequently accessed data
- Consider using Redis for session management
- Set up proper logging and monitoring

## 📚 Documentation

- **`API_DOCUMENTATION.md`** - Complete API reference
- **Environment Variables** - Configuration options
- **Database Schema** - Table structures and relationships

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:

1. Check the API documentation
2. Review server logs
3. Test database connectivity
4. Verify environment configuration

## 🔄 Changelog

### v1.0.0

- Initial release with multi-tenant architecture
- WhatsApp Business API integration
- OpenAI GPT-4 integration
- Business management API
- Media file handling
- Database migration support
