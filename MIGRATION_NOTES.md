# Migration Notes

This document describes the migration from WorkPackages to Tasks and the addition of structured project specs.

## Database Migrations

Run these migrations in order (the database schema will be automatically created on server start, but these migrations add columns to existing tables):

**Windows PowerShell:**
```powershell
cd server
node migrate-to-structured-specs.js
node migrate-to-tasks.js
```

**Linux/Mac:**
```bash
cd server && node migrate-to-structured-specs.js
cd server && node migrate-to-tasks.js
```

Note: The database schema is automatically created/updated when the server starts, so these migrations are mainly for adding columns to existing tables.

## Key Changes

### 1. Project Specifications
- Projects now have structured spec fields:
  - `specStrengthPsi` (TEXT)
  - `specAmbientTempF` (TEXT)
  - `specConcreteTempF` (TEXT)
  - `specSlump` (TEXT)
  - `specAirContentByVolume` (TEXT)

### 2. Tasks Table
- New `tasks` table replaces the conceptual model of workpackages
- Task types include:
  - DENSITY_MEASUREMENT
  - PROCTOR
  - REBAR
  - COMPRESSIVE_STRENGTH
  - CYLINDER_PICKUP
  - COMPRESSIVE_STRENGTH_FIELD_REPORT (replaces WP1)
  - PROCTOR_REPORT
  - DENSITY_MEASUREMENT_REPORT
  - REBAR_REPORT

### 3. WP1 Data
- `wp1_data` table now supports both `taskId` (new) and `workPackageId` (backward compatibility)
- WP1 forms auto-populate specs from project-level specs

### 4. Status Workflow
- New status values:
  - ASSIGNED
  - IN_PROGRESS_TECH
  - READY_FOR_REVIEW
  - APPROVED
  - REJECTED_NEEDS_FIX

### 5. Approve/Reject Workflow
- Tasks can be rejected with `rejectionRemarks` and `resubmissionDueDate`
- Rejected tasks show up for technicians with remarks and new due date

## Backward Compatibility

The existing WP1 form continues to work with workpackages for now, but new tasks should use the tasks API endpoints.

## API Endpoints

### Tasks
- `GET /api/tasks` - List all tasks (filtered by role)
- `GET /api/tasks/project/:projectId` - Get tasks for a project
- `GET /api/tasks/:id` - Get single task
- `POST /api/tasks` - Create task (Admin only)
- `PUT /api/tasks/:id/status` - Update task status
- `POST /api/tasks/:id/approve` - Approve task (Admin only)
- `POST /api/tasks/:id/reject` - Reject task (Admin only)

### Dashboard
- `GET /api/tasks/dashboard/today` - Get today's tasks
- `GET /api/tasks/dashboard/previous-day` - Get previous day's tasks
- `GET /api/tasks/dashboard/overdue` - Get overdue tasks

### WP1 (Tasks)
- `GET /api/wp1/task/:taskId` - Get WP1 data for task
- `POST /api/wp1/task/:taskId` - Save WP1 data for task

