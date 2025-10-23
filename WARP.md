# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Overview

This is the Mata Group Expense Management System - a comprehensive expense tracking application built with Node.js, Express, and PostgreSQL, optimized for mobile devices. The system handles multi-role user management, expense tracking, account management, and partner delivery validation.

## Development Commands

### Dependencies & Setup
```bash
# Install dependencies
npm install

# Development mode (if nodemon is available)
npm run dev
```

### Testing
```bash
# Run core function tests
npm test

# Run regression tests  
npm run test:regression
# OR
npm run test:bovin

# Run all tests
npm run test:all
```

### Production
```bash
# Start production server
npm start

# Build (no build step required for this project)
npm run build
```

### Database Operations
**Important**: `psql` is not available in this environment. Execute SQL scripts via Node.js instead.

## Architecture Overview

### Core Components

**Backend Architecture (server.js)**:
- **Express.js** server with session-based authentication
- **PostgreSQL** database with complex financial operations
- **File upload** system using Multer for justification documents
- **PDF generation** capabilities with PDFKit
- **Auto-sync** system for account balance corrections
- **Snapshot system** for financial reporting

**Frontend Architecture (public/app.js)**:
- **Vanilla JavaScript** SPA with mobile-first responsive design
- **Environment detection** (development vs production)
- **Real-time** dashboard with financial calculations
- **Role-based UI** adaptation (directeur, directeur_general, pca, comptable)
- **Touch-optimized** interface for mobile devices

**Database Schema** (database_schema.sql):
- **Multi-role user system** with hierarchical permissions
- **Account types**: classique, partenaire, statut, depot, Ajustement
- **Expense tracking** with categories, subcategories, and validation workflows
- **Credit history** and partner delivery management
- **Auto-sync triggers** for balance corrections

### Key Features
- **48-hour edit restriction** for directors on expenses
- **Partner validation system** with two-tier approval
- **Stock management** with "stock vivant" functionality  
- **Snapshot reporting** with HTML scraping capabilities
- **Mobile responsiveness** with iOS/Android specific optimizations
- **Real-time balance calculations** with automatic corrections

### File Structure
```
├── public/
│   ├── index.html          # Main SPA file
│   ├── app.js             # Frontend JavaScript
│   ├── snapshots.js       # Snapshot functionality
│   └── styles.css         # Mobile-responsive CSS
├── uploads/               # File upload directory
├── server.js             # Main Express server
├── database_schema.sql   # Complete DB schema
├── render.yaml          # Render.com deployment config
└── test_*.js            # Test suites
```

## Database Development Notes

### Environment Variables Required
```
NODE_ENV=production
PORT=10000
SESSION_SECRET=[32-character string]
DB_HOST=[database host]
DB_PORT=5432
DB_NAME=depenses_management
DB_USER=[database user]  
DB_PASSWORD=[database password]
```

### Local Development Database
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=depenses_management_preprod
DB_USER=zalint
DB_PASSWORD=bonea2024
```

### Critical Date Handling Rule
**TIMEZONE ISSUE**: Never use `new Date(year, month, day)` constructor as it causes timezone shifts.
- ❌ **WRONG**: `new Date(2025, 8, 1)` → becomes "2025-08-31T20:00:00.000Z"
- ✅ **CORRECT**: `new Date("2025-09-01T00:00:00")` → stays "2025-09-01T00:00:00.000Z"

Always use explicit date strings to avoid timezone-related bugs.

## Testing Guidelines

- Update `GUIDE_TESTS_NON_REGRESSION.md` as the application evolves
- Always read `GUIDE_TESTS_NON_REGRESSION.md` before making changes
- Update `github_test_database_setup.sql` when the SQL schema changes
- Use Node.js scripts to execute SQL instead of `psql` commands

## Default Users for Testing

| Username | Password | Role | Full Name |
|----------|----------|------|-----------|
| `Ousmane` | `password123` | Directeur Général | Ousmane SECK |
| `Saliou` | `password123` | PCA | Saliou DOUCOURE |
| `Nadou` | `password123` | Directeur | Nadou BA |

## Platform Context

This application is optimized for Windows development environment and deployed on Render.com with:
- Node.js 18+
- PostgreSQL 12+
- Mobile-first responsive design for iPhone/Android
- Session-based authentication with bcrypt
- File upload support for expense justifications

## Key Technical Constraints

1. **No linting/formatting tools** configured - maintain existing code style
2. **Mobile-first design** - all UI changes must work on mobile devices  
3. **Role-based permissions** - respect user role restrictions throughout
4. **Balance sync system** - account modifications trigger automatic balance corrections
5. **Partner validation workflow** - expenses require multi-tier approvals
6. **48-hour editing window** - time-based restrictions on expense modifications