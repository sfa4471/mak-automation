# MAK Lone Star Consulting - Field Report Automation

Mobile-friendly web application to replace paper-based field reports and Excel workflows.

## Features

- **Role-based Authentication**: ADMIN and TECHNICIAN roles
- **Project Management**: Auto-generated project numbers (MAK-YYYY-####)
- **Work Package System**: 5 work packages per project (WP1 fully implemented)
- **Compressive Strength Field Report (WP1)**: Complete form matching paper reports
- **Autosave**: Debounced autosave with UI indicators
- **PDF Generation**: Generate reports matching original format
- **Real-time Updates**: Admin can see technician updates immediately

## Tech Stack

- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL) - Primary | SQLite - Fallback
- **Frontend**: React
- **Authentication**: JWT tokens
- **PDF**: PDFKit

## Setup

### 1. Install Dependencies

```bash
npm run install-all
```

### 2. Configure Supabase (Recommended)

The application uses **Supabase** (PostgreSQL) as the primary database. SQLite is available as a fallback for local development.

#### Option A: Quick Setup (Automated)

1. Get your Supabase credentials:
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project (or create a new one)
   - Navigate to **Settings → API**
   - Copy the following:
     - **Project URL** → `SUPABASE_URL`
     - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

2. Run the setup script:
   ```bash
   SUPABASE_URL=https://your-project.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npm run supabase:setup
   ```

   Or manually add to `.env`:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

3. Run database migrations:
   ```bash
   npm run supabase:execute-and-verify
   ```

#### Option B: Manual Setup

1. Create a `.env` file in the project root:
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

2. Verify connection:
   ```bash
   npm run supabase:verify-connection
   ```

3. Run migrations:
   ```bash
   npm run supabase:execute-and-verify
   ```

#### Option C: Use SQLite (Fallback)

If Supabase is not configured, the application will automatically fall back to SQLite:
- SQLite database (`mak_automation.db`) is created automatically in the `server/` directory
- No additional configuration needed
- **Note:** SQLite is for local development only. Use Supabase for production.

### 3. Configure Network Access

**For local development** (same machine):
   - No additional configuration needed - defaults to `http://localhost:5000/api`

**For mobile testing** (phone on same WiFi):
   ```bash
   npm run setup-mobile
   ```
   This will:
   - Auto-detect your machine's local IP address
   - Create `client/.env` with the correct API URL
   - Allow your phone to connect to the backend

### 4. Start Development Server

```bash
npm run dev
```

This will start:
- Backend API on http://localhost:5000 (or your IP:5000)
- Frontend React app on http://localhost:3000 (or your IP:3000)

### 5. Open Your Browser

   - **Same machine**: http://localhost:3000
   - **Mobile device**: http://YOUR_IP:3000 (shown after running setup-mobile)

## Default Admin Credentials

- Email: `admin@maklonestar.com`
- Password: `admin123`

## Features Implemented

✅ **Authentication & Authorization**
- Email/password login
- Role-based access control (ADMIN/TECHNICIAN)
- JWT token-based sessions

✅ **Project Management**
- Auto-generated project numbers (MAK-YYYY-####)
- Create projects with customer email
- Automatic creation of 5 work packages per project

✅ **Work Package System**
- 5 work packages per project (WP1 fully implemented)
- Status workflow: Draft → Assigned → In Progress → Submitted → Approved
- Assignment to technicians

✅ **WP1 - Compressive Strength Field Report**
- Complete form matching paper reports
- Project Information (read-only)
- Placement Information
- Sample Information with test results table
- Specimen Information with multiple sets
- Auto-calculated fields (cross-sectional area, compressive strength)
- Auto-populated test dates based on placement date

✅ **Autosave**
- Debounced autosave (800ms)
- Visual indicators: "Saving...", "Saved at HH:MM"
- Manual save button

✅ **PDF Generation**
- Generates PDF matching original report format
- Includes all form data
- Properly formatted tables

✅ **Admin Dashboard**
- View all projects
- Create new projects
- Manage technicians
- Assign work packages
- View all work packages

✅ **Technician Dashboard**
- View assigned work packages only
- Enter/update field data
- Submit work packages
- Generate PDFs

## Database

### Supabase (Primary - Recommended)

The application uses **Supabase** (PostgreSQL) as the primary database for production and development.

**Features:**
- PostgreSQL database with full SQL support
- JSONB support for flexible data storage
- Row Level Security (RLS) support
- Real-time subscriptions
- Automatic backups
- Scalable infrastructure

**Setup:**
See [Setup instructions](#2-configure-supabase-recommended) above.

**Migration:**
- Run `npm run supabase:execute-and-verify` to create all tables and indexes
- See `supabase/migrations/` for migration files

**Verification:**
- `npm run supabase:verify-connection` - Test connection
- `npm run supabase:verify` - Verify tables
- `npm run supabase:execute-and-verify` - Full verification

### SQLite (Fallback)

SQLite is available as a fallback for local development when Supabase is not configured.

**Features:**
- No configuration needed
- Automatic database creation
- Local file-based storage

**Usage:**
- If Supabase credentials are not set, the application automatically uses SQLite
- Database file: `server/mak_automation.db`
- Created automatically on first run

**Note:** SQLite is for local development only. Use Supabase for production deployments.

## API Documentation

All API endpoints require authentication via JWT token in the Authorization header:
```
Authorization: Bearer <token>
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login
- `GET /api/auth/me` - Get current user
- `POST /api/auth/technicians` - Create technician (Admin only)
- `GET /api/auth/technicians` - List technicians (Admin only)

### Projects
- `POST /api/projects` - Create project (Admin only)
- `GET /api/projects` - List projects
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project (Admin only)

### Work Packages
- `GET /api/workpackages/project/:projectId` - Get work packages for project
- `GET /api/workpackages/:id` - Get work package
- `PUT /api/workpackages/:id/assign` - Assign to technician (Admin only)
- `PUT /api/workpackages/:id/status` - Update status
- `GET /api/workpackages/:id/wp1` - Get WP1 data
- `POST /api/workpackages/:id/wp1` - Save WP1 data

### PDF
- `GET /api/pdf/wp1/:workPackageId` - Generate WP1 PDF

## Workflow Guide

See [WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md) for detailed instructions on testing the admin and technician workflow.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm run install-all
   ```

2. **Set up Supabase** (recommended):
   ```bash
   # Add to .env file:
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   
   # Run migrations:
   npm run supabase:execute-and-verify
   ```
   
   Or skip this step to use SQLite fallback (local development only).

3. **Start server:**
   ```bash
   npm run dev
   ```

4. **Open browser:** http://localhost:3000

5. **Login as admin:**
   - Email: `admin@maklonestar.com`
   - Password: `admin123`

6. **Create technician, project, and assign work package**

7. **Login as technician to complete the workflow**

## Available Scripts

### Database Scripts
- `npm run supabase:setup` - Set up Supabase environment variables
- `npm run supabase:verify-connection` - Verify Supabase connection
- `npm run supabase:verify` - Verify all tables exist
- `npm run supabase:execute-and-verify` - Execute migrations and verify
- `npm run supabase:migrate-data` - Migrate data from SQLite to Supabase

### Development Scripts
- `npm run dev` - Start development server (backend + frontend)
- `npm run server` - Start backend only
- `npm run client` - Start frontend only
- `npm run build` - Build frontend for production

### Utility Scripts
- `npm run setup-mobile` - Configure for mobile device access
- `npm run reset-password` - Reset user password

