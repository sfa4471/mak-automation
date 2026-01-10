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

- **Backend**: Node.js, Express, SQLite
- **Frontend**: React (to be created)
- **Authentication**: JWT tokens
- **PDF**: PDFKit

## Setup

1. Install dependencies:
```bash
npm run install-all
```

2. **For local development** (same machine):
   - No configuration needed - defaults to `http://localhost:5000/api`

3. **For mobile testing** (phone on same WiFi):
   ```bash
   npm run setup-mobile
   ```
   This will:
   - Auto-detect your machine's local IP address
   - Create `client/.env` with the correct API URL
   - Allow your phone to connect to the backend

4. Start development server:
```bash
npm run dev
```

This will start:
- Backend API on http://localhost:5000 (or your IP:5000)
- Frontend React app on http://localhost:3000 (or your IP:3000)

5. Open your browser:
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

SQLite database (`mak_automation.db`) is created automatically on first run in the `server/` directory.

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

## Database

SQLite database (`mak_automation.db`) is created automatically on first run.

## Workflow Guide

See [WORKFLOW_GUIDE.md](./WORKFLOW_GUIDE.md) for detailed instructions on testing the admin and technician workflow.

## Quick Start

1. Install dependencies: `npm run install-all`
2. Start server: `npm run dev`
3. Open browser: `http://localhost:3000`
4. Login as admin: `admin@maklonestar.com` / `admin123`
5. Create technician, project, and assign work package
6. Login as technician to complete the workflow

