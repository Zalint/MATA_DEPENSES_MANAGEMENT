# 💰 Mata Group - Expense Management System

A comprehensive expense management application built with Node.js, Express, and PostgreSQL, optimized for mobile devices (iPhone & Android).

## 🚀 Features

- **User Management**: Multi-role system (Directeur, Directeur Général, PCA)
- **Expense Tracking**: Complete expense management with categories and subcategories
- **Account Management**: Multiple account types with balance tracking
- **Partner Management**: Delivery tracking and validation system
- **Mobile Responsive**: Optimized for iPhone and Android devices
- **48-Hour Edit Restriction**: Time-based editing restrictions for directors
- **File Upload**: Justification document support
- **Dashboard Analytics**: Real-time expense tracking and reporting

## 📱 Mobile Optimization

- **Touch-Friendly Interface**: 44px minimum touch targets
- **Responsive Design**: Mobile-first approach with breakpoints
- **iOS/Android Specific**: Platform-specific optimizations
- **Hamburger Menu**: Slide-out navigation for mobile
- **Safe Area Support**: iPhone notch and home indicator support

## 🛠 Technology Stack

- **Backend**: Node.js, Express.js
- **Database**: PostgreSQL
- **Frontend**: Vanilla JavaScript, CSS3
- **Authentication**: Session-based with bcrypt
- **File Upload**: Multer middleware
- **Deployment**: Render.com

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- npm or yarn

## 🚀 Deployment on Render - Step by Step

### Step 1: Prepare Your Repository

1. **Create a GitHub Repository**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/depenses-management.git
   git push -u origin main
   ```

### Step 2: Set Up Render Account

1. Go to [render.com](https://render.com)
2. Sign up/Login with your GitHub account
3. Connect your GitHub repository

### Step 3: Create PostgreSQL Database

1. **In Render Dashboard:**
   - Click "New +" → "PostgreSQL"
   - **Name**: `depenses-db`
   - **Database**: `depenses_management`
   - **User**: `depenses_user`
   - **Region**: Choose closest to your users
   - **Plan**: Starter ($7/month) or Free (limited)

2. **Note the Database Details:**
   - External Database URL
   - Internal Database URL
   - Host, Port, Database Name, Username, Password

### Step 4: Initialize Database Schema

1. **Connect to your database** using the External Database URL:
   ```bash
   psql "postgresql://username:password@host:port/database"
   ```

2. **Run the schema file:**
   ```bash
   \i database_schema.sql
   ```

   Or copy and paste the contents of `database_schema.sql` into the psql terminal.

3. **Verify tables were created:**
   ```sql
   \dt
   ```

### Step 5: Create Web Service

1. **In Render Dashboard:**
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - **Name**: `depenses-management`
   - **Environment**: `Node`
   - **Region**: Same as database
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`

### Step 6: Configure Environment Variables

Add these environment variables in Render:

```
NODE_ENV=production
PORT=10000
SESSION_SECRET=[Generate a random 32-character string]
DB_HOST=[Your database host from Step 3]
DB_PORT=[Your database port, usually 5432]
DB_NAME=depenses_management
DB_USER=[Your database username]
DB_PASSWORD=[Your database password]
```

### Step 7: Deploy

1. Click "Create Web Service"
2. Render will automatically build and deploy your application
3. Monitor the build logs for any errors

### Step 8: Verify Deployment

1. **Access your application** at the provided Render URL
2. **Test login** with default credentials:
   - **DG**: `Ousmane` / `password123`
   - **PCA**: `Saliou` / `password123`
   - **Director**: `Nadou` / `password123`

## 🗄️ Database Schema

### Core Tables

#### Users Table
```sql
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    full_name VARCHAR(100),
    email VARCHAR(100),
    role VARCHAR(20) CHECK (role IN ('directeur', 'directeur_general', 'pca')),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Accounts Table
```sql
CREATE TABLE accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id),
    account_name VARCHAR(100) NOT NULL,
    current_balance DECIMAL(15,2) DEFAULT 0,
    total_credited DECIMAL(15,2) DEFAULT 0,
    total_spent DECIMAL(15,2) DEFAULT 0,
    account_type VARCHAR(20) DEFAULT 'classique',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Expenses Table
```sql
CREATE TABLE expenses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    account_id INTEGER REFERENCES accounts(id),
    designation TEXT NOT NULL,
    supplier VARCHAR(100),
    total DECIMAL(15,2) NOT NULL,
    expense_date DATE NOT NULL,
    expense_type VARCHAR(50),
    category VARCHAR(100),
    subcategory VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Additional Tables
- `credit_history` - Account credit tracking
- `partner_deliveries` - Partner delivery management
- `partner_directors` - Partner-director assignments

## 🔧 Configuration

### Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | Server port | `10000` |
| `DB_HOST` | Database host | `dpg-xxx.oregon-postgres.render.com` |
| `DB_PORT` | Database port | `5432` |
| `DB_NAME` | Database name | `depenses_management` |
| `DB_USER` | Database user | `depenses_user` |
| `DB_PASSWORD` | Database password | `your_password` |
| `SESSION_SECRET` | Session encryption key | `random_32_char_string` |

### File Structure
```
depenses-management/
├── public/
│   ├── index.html          # Main HTML file
│   ├── app.js             # Frontend JavaScript
│   ├── styles.css         # Mobile-responsive CSS
│   └── categories_config.json
├── uploads/               # File upload directory
├── server.js             # Main server file
├── package.json          # Dependencies
├── database_schema.sql   # Database schema
├── render.yaml          # Render configuration
└── README.md           # This file
```

## 🔐 Default Users

| Username | Password | Role | Full Name |
|----------|----------|------|-----------|
| `Ousmane` | `password123` | Directeur Général | Ousmane SECK |
| `Saliou` | `password123` | PCA | Saliou DOUCOURE |
| `Mame Diarra` | `password123` | Directeur | Mame Diarra NDIAYE |
| `Papi` | `password123` | Directeur | Massata DIOP |
| `Nadou` | `password123` | Directeur | Nadou BA |
| `Madieye` | `password123` | Directeur | Madieye SECK |
| `Babacar` | `password123` | Directeur | Babacar DIENE |

## 📱 Mobile Features

- **Responsive Navigation**: Hamburger menu for mobile
- **Touch Optimization**: 44px minimum touch targets
- **iOS Support**: Safe area handling for notched devices
- **Android Support**: Material design elements
- **Table Scrolling**: Horizontal scroll for data tables
- **Form Optimization**: Large input fields and buttons

## 🛡️ Security Features

- **Password Hashing**: bcrypt with salt rounds
- **Session Management**: Secure session handling
- **Role-Based Access**: Multi-level permission system
- **Input Validation**: Server-side validation
- **SQL Injection Protection**: Parameterized queries

## 🔄 Maintenance

### Database Backup
```bash
pg_dump "postgresql://username:password@host:port/database" > backup.sql
```

### Database Restore
```bash
psql "postgresql://username:password@host:port/database" < backup.sql
```

### Update Dependencies
```bash
npm update
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Error**
   - Verify environment variables
   - Check database status in Render dashboard
   - Ensure database is in same region as web service

2. **Build Failures**
   - Check Node.js version compatibility
   - Verify package.json dependencies
   - Review build logs in Render

3. **File Upload Issues**
   - Ensure uploads directory exists
   - Check file size limits
   - Verify multer configuration

### Logs
Access logs in Render dashboard under "Logs" tab for debugging.

## 📞 Support

For technical support or questions:
- Check Render documentation: [render.com/docs](https://render.com/docs)
- Review application logs in Render dashboard
- Verify database connectivity and schema

## 📄 License

MIT License - see LICENSE file for details.

---

**Mata Group Expense Management System** - Built with ❤️ for efficient expense tracking and management. 