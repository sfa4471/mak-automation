# OneDrive Integration & PDF Naming Plan
## Senior Software Developer Planning Document

**Date:** January 2025  
**Project:** MAK Automation - OneDrive Integration & Enhanced PDF Management  
**Planner:** Senior Software Developer (20+ years experience)

---

## Executive Summary

This plan outlines the implementation of OneDrive folder integration for project storage and a standardized PDF naming convention. The solution will allow clients to select a OneDrive-synced folder as the base directory, automatically create project folders upon project creation, and generate PDFs with a consistent naming format: `ProjectNumber-TaskName.pdf`.

---

## 1. Requirements Analysis

### 1.1 Functional Requirements

1. **OneDrive Folder Selection**
   - Admin user must be able to select/configure a base folder path that is linked to OneDrive
   - The folder path should be persisted (database or configuration file)
   - Validation to ensure the folder exists and is writable
   - Support for both Windows and cross-platform paths

2. **Automatic Project Folder Creation**
   - When a new project is created, automatically create a folder within the selected OneDrive base folder
   - Folder name should use the project number (e.g., `02-2026-4001`)
   - Ensure folder creation is atomic and handles errors gracefully
   - Support for existing projects (migration path)

3. **PDF Naming Convention**
   - Format: `ProjectNumber-TaskName.pdf`
   - Example: `02-2026-4001-Rebar Inspection.pdf`
   - Task names should be human-readable (e.g., "Rebar Inspection" instead of "REBAR")
   - Handle special characters in task names (sanitize for filesystem)
   - Handle duplicate names (append sequence number or timestamp if needed)

### 1.2 Non-Functional Requirements

1. **Performance**
   - Folder creation should not block project creation
   - PDF generation should remain fast
   - Minimal impact on existing workflows

2. **Reliability**
   - Graceful degradation if OneDrive folder is unavailable
   - Error logging and user notifications
   - Retry mechanisms for transient failures

3. **Security**
   - Validate folder paths to prevent directory traversal
   - Ensure proper file permissions
   - Sanitize all user inputs

4. **Maintainability**
   - Clear separation of concerns
   - Backward compatibility with existing PDF storage
   - Easy configuration and migration

---

## 2. Technical Architecture

### 2.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│  - Settings UI for OneDrive folder selection               │
│  - Folder path input/validation                            │
│  - Visual feedback for folder status                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ HTTP API
                       │
┌──────────────────────▼──────────────────────────────────────┐
│                  Backend (Express)                          │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Settings API Route                                  │  │
│  │  - GET /api/settings/onedrive-path                   │  │
│  │  - POST /api/settings/onedrive-path                 │  │
│  │  - Validation & persistence                          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Enhanced Project Route                              │  │
│  │  - POST /api/projects (modified)                    │  │
│  │  - Auto-create project folder in OneDrive            │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Enhanced PDF Manager                                 │  │
│  │  - Modified saveReportPDF()                          │  │
│  │  - New naming convention                             │  │
│  │  - Task name resolution                              │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  OneDrive Folder Service                             │  │
│  │  - Folder path management                            │  │
│  │  - Path validation                                   │  │
│  │  - Folder creation utilities                         │  │
│  └──────────────────────────────────────────────────────┘  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       │ File System
                       │
┌──────────────────────▼──────────────────────────────────────┐
│              OneDrive-Synced Folder Structure                │
│                                                              │
│  /SelectedOneDriveFolder/                                    │
│    ├── 02-2026-4001/                                        │
│    │   ├── 02-2026-4001-Rebar Inspection.pdf              │
│    │   ├── 02-2026-4001-Compressive Strength.pdf          │
│    │   └── ...                                              │
│    ├── 02-2026-4002/                                        │
│    └── ...                                                   │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

1. **Initial Setup (OneDrive Folder Selection)**
   ```
   Admin → Settings UI → POST /api/settings/onedrive-path
   → Validate path → Store in database/config
   → Return success/error
   ```

2. **Project Creation**
   ```
   Admin → Create Project → POST /api/projects
   → Generate project number
   → Create project in database
   → Create folder: {onedrivePath}/{projectNumber}/
   → Return project data
   ```

3. **PDF Generation**
   ```
   User → Generate PDF → GET /api/pdf/...
   → Generate PDF buffer
   → Resolve task name (taskType → human-readable)
   → Format filename: {projectNumber}-{taskName}.pdf
   → Save to: {onedrivePath}/{projectNumber}/{filename}
   → Return PDF to user
   ```

---

## 3. Implementation Plan

### 3.1 Phase 1: Settings & Configuration Management

**Objective:** Allow admin to configure OneDrive base folder path

**Tasks:**
1. Create database table or configuration storage for settings
   - Table: `app_settings` (key-value store)
   - Or use environment variable with UI override
   - Recommendation: Database table for flexibility

2. Create settings API routes (`server/routes/settings.js`)
   ```javascript
   GET  /api/settings/onedrive-path     // Get current path
   POST /api/settings/onedrive-path     // Set/update path
   GET  /api/settings/onedrive-status   // Check if path is valid/accessible
   ```

3. Create OneDrive folder service (`server/services/onedriveService.js`)
   - `validatePath(path)` - Check if path exists and is writable
   - `getBasePath()` - Get configured base path
   - `ensureProjectFolder(projectNumber)` - Create project folder
   - `sanitizePath(path)` - Security: prevent directory traversal

4. Create frontend settings component
   - Admin-only settings page
   - Folder path input with browse button (if possible)
   - Path validation feedback
   - Test connection button

**Files to Create/Modify:**
- `server/routes/settings.js` (new)
- `server/services/onedriveService.js` (new)
- `server/db/supabase.js` or migration (add settings table)
- `client/src/components/admin/Settings.tsx` (new)
- `client/src/api/settings.ts` (new)

**Database Schema:**
```sql
CREATE TABLE IF NOT EXISTS app_settings (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_by_user_id INTEGER REFERENCES users(id)
);

-- Initial insert
INSERT INTO app_settings (key, value, description) 
VALUES ('onedrive_base_path', NULL, 'Base folder path for OneDrive integration');
```

---

### 3.2 Phase 2: Automatic Project Folder Creation

**Objective:** Automatically create project folders in OneDrive when projects are created

**Tasks:**
1. Modify project creation route (`server/routes/projects.js`)
   - After successful project creation in database
   - Call `onedriveService.ensureProjectFolder(projectNumber)`
   - Handle errors gracefully (log but don't fail project creation)
   - Return folder creation status in response

2. Enhance `onedriveService.ensureProjectFolder()`
   - Check if base path is configured
   - Create folder: `{basePath}/{projectNumber}`
   - Handle Windows path separators correctly
   - Return folder path on success

3. Migration for existing projects
   - Script to create folders for all existing projects
   - Optional: Run on startup or via admin command

**Files to Modify:**
- `server/routes/projects.js` (modify POST /)
- `server/services/onedriveService.js` (enhance)

**Error Handling:**
- If OneDrive folder creation fails, log error but allow project creation to succeed
- Store error in project metadata or log for admin review
- Provide admin UI to retry folder creation for failed projects

---

### 3.3 Phase 3: Enhanced PDF Naming Convention

**Objective:** Implement new PDF naming: `ProjectNumber-TaskName.pdf`

**Tasks:**
1. Create task name resolver utility
   - Map `taskType` enum to human-readable names
   - Handle special cases (e.g., Proctor with number)
   - Sanitize task names for filesystem (remove invalid chars)

2. Modify PDF file manager (`server/utils/pdfFileManager.js`)
   - Update `saveReportPDF()` to accept task information
   - Generate filename: `{projectNumber}-{taskName}.pdf`
   - Handle duplicates (append `-1`, `-2`, etc. or timestamp)
   - Save to OneDrive project folder instead of old structure

3. Update all PDF generation routes
   - Pass task information to `saveReportPDF()`
   - Routes: `server/routes/pdf.js`, `server/routes/proctor.js`, etc.
   - Ensure project number and task name are available

4. Maintain backward compatibility
   - Support both old and new naming conventions during transition
   - Configuration flag to switch between modes
   - Migration script to rename existing PDFs (optional)

**Files to Modify:**
- `server/utils/pdfFileManager.js` (major refactor)
- `server/routes/pdf.js` (update all PDF endpoints)
- `server/routes/proctor.js` (update)
- `server/routes/rebar.js` (if exists, update)
- `server/routes/density.js` (if exists, update)

**Task Name Mapping:**
```javascript
const TASK_NAME_MAP = {
  'DENSITY_MEASUREMENT': 'Density Measurement',
  'PROCTOR': 'Proctor',  // May append number: "Proctor 1"
  'REBAR': 'Rebar Inspection',
  'COMPRESSIVE_STRENGTH': 'Compressive Strength',
  'CYLINDER_PICKUP': 'Cylinder Pickup'
};
```

**Filename Sanitization:**
- Remove/replace invalid filesystem characters: `\ / : * ? " < > |`
- Replace spaces with hyphens or keep spaces (Windows supports spaces)
- Limit filename length (Windows: 255 chars, be conservative: 200 chars)
- Handle special characters in project numbers

**Duplicate Handling:**
- Check if file exists before saving
- If exists, append `-1`, `-2`, etc.
- Or append timestamp: `-YYYYMMDD-HHMMSS`
- Recommendation: Use sequence numbers for cleaner names

---

### 3.4 Phase 4: Frontend Integration

**Objective:** Provide UI for OneDrive folder management and visual feedback

**Tasks:**
1. Create Admin Settings page
   - OneDrive folder path configuration
   - Path validation and test connection
   - Display current status
   - Show list of project folders

2. Update project creation UI
   - Show folder creation status
   - Display OneDrive folder path in project details

3. Update PDF generation UI
   - Show new filename format
   - Display save location
   - Success message with file path

**Files to Create/Modify:**
- `client/src/components/admin/Settings.tsx` (new)
- `client/src/components/admin/CreateProject.tsx` (enhance)
- `client/src/components/admin/ProjectDetails.tsx` (if exists, enhance)
- `client/src/App.tsx` (add settings route)

---

## 4. Technical Considerations

### 4.1 Cross-Platform Path Handling

**Challenge:** Windows vs. Unix path separators

**Solution:**
- Use Node.js `path.join()` for all path operations
- Normalize paths on input
- Store paths as-is (let OS handle it)
- Test on both Windows and Linux/Mac

**Code Pattern:**
```javascript
const path = require('path');
const normalizedPath = path.normalize(userInputPath);
const fullPath = path.join(basePath, projectNumber, filename);
```

### 4.2 OneDrive Sync Behavior

**Challenge:** OneDrive may not be immediately synced

**Solution:**
- Don't rely on immediate sync
- Save files locally (OneDrive will sync automatically)
- Provide user feedback that file is saved locally
- Consider async sync status checking (optional enhancement)

### 4.3 Error Handling Strategy

**Levels of Error Handling:**

1. **Critical Errors** (database failure, invalid config)
   - Fail the operation
   - Return error to user
   - Log error

2. **Non-Critical Errors** (folder creation fails, PDF save fails)
   - Log error
   - Continue with operation if possible
   - Notify user of partial failure
   - Provide retry mechanism

3. **Warnings** (path not configured, OneDrive not available)
   - Log warning
   - Use fallback behavior (old PDF location)
   - Notify admin

### 4.4 Security Considerations

1. **Path Validation**
   - Prevent directory traversal (`../`, `..\\`)
   - Validate path is within allowed directory
   - Check for symlinks (optional)

2. **Input Sanitization**
   - Sanitize project numbers
   - Sanitize task names
   - Validate all user inputs

3. **File Permissions**
   - Ensure proper file permissions
   - Don't expose system paths in errors

**Security Code:**
```javascript
function sanitizePath(userPath) {
  // Remove directory traversal attempts
  const normalized = path.normalize(userPath);
  if (normalized.includes('..')) {
    throw new Error('Invalid path: directory traversal detected');
  }
  return normalized;
}

function sanitizeFilename(filename) {
  // Remove invalid filesystem characters
  return filename.replace(/[<>:"/\\|?*]/g, '_');
}
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

- OneDrive service path validation
- Filename generation and sanitization
- Task name resolution
- Error handling scenarios

### 5.2 Integration Tests

- Project creation with folder creation
- PDF generation with new naming
- Settings API endpoints
- Cross-platform path handling

### 5.3 Manual Testing Checklist

- [ ] Configure OneDrive folder path
- [ ] Create new project → verify folder created
- [ ] Generate PDF for each task type → verify naming
- [ ] Test with invalid paths → verify error handling
- [ ] Test with OneDrive folder unavailable → verify fallback
- [ ] Test duplicate PDF names → verify sequence handling
- [ ] Test on Windows and Linux/Mac (if applicable)
- [ ] Verify OneDrive sync works correctly

---

## 6. Migration Strategy

### 6.1 Existing Projects

**Option A: Lazy Migration**
- Create folders when projects are accessed
- Create folders when PDFs are generated

**Option B: Batch Migration**
- Admin script to create folders for all projects
- Run on deployment or via admin UI

**Recommendation:** Option A (lazy migration) - less disruptive

### 6.2 Existing PDFs

**Option A: Leave as-is**
- Old PDFs remain in old location
- New PDFs use new location and naming

**Option B: Migration Script**
- Rename and move existing PDFs
- Update database references (if any)

**Recommendation:** Option A - less risk, cleaner separation

---

## 7. Configuration & Environment Variables

### 7.1 New Environment Variables

```env
# Optional: Default OneDrive path (can be overridden in UI)
ONEDRIVE_BASE_PATH=C:\Users\Client\OneDrive\Projects

# Fallback PDF path (if OneDrive not configured)
PDF_BASE_PATH=./pdfs

# Enable new PDF naming convention
USE_NEW_PDF_NAMING=true
```

### 7.2 Database Configuration

Store in `app_settings` table:
- `onedrive_base_path`: The configured OneDrive folder path
- `pdf_naming_convention`: 'new' or 'legacy'

---

## 8. Rollout Plan

### 8.1 Development Phase

1. **Week 1:** Settings API and OneDrive service
2. **Week 2:** Project folder auto-creation
3. **Week 3:** PDF naming convention implementation
4. **Week 4:** Frontend integration and testing

### 8.2 Deployment Phase

1. **Pre-deployment:**
   - Database migration for settings table
   - Backup existing PDFs
   - Test in staging environment

2. **Deployment:**
   - Deploy backend changes
   - Deploy frontend changes
   - Monitor for errors

3. **Post-deployment:**
   - Admin configures OneDrive path
   - Verify project folder creation
   - Verify PDF generation
   - Monitor logs for issues

---

## 9. Risk Assessment & Mitigation

### 9.1 Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| OneDrive folder unavailable | Medium | High | Fallback to local storage, retry mechanism |
| Path validation fails | Low | Medium | Comprehensive validation, clear error messages |
| Cross-platform path issues | Medium | Medium | Use Node.js path module, test on all platforms |
| Existing PDFs become inaccessible | Low | Low | Keep old system as fallback, migration script |
| Performance impact | Low | Low | Async folder creation, efficient file operations |

### 9.2 Rollback Plan

- Feature flags to disable new features
- Keep old PDF system as fallback
- Database rollback script for settings table
- Revert code deployment if critical issues

---

## 10. Future Enhancements

1. **OneDrive API Integration**
   - Direct API integration instead of file system
   - Real-time sync status
   - Cloud-only storage option

2. **Folder Structure Customization**
   - Allow custom folder structures
   - Subfolders by task type
   - Date-based organization

3. **PDF Metadata**
   - Embed metadata in PDFs
   - Searchable PDFs
   - Automatic tagging

4. **Bulk Operations**
   - Bulk folder creation
   - Bulk PDF migration
   - Folder cleanup utilities

---

## 11. Success Criteria

✅ Admin can configure OneDrive folder path  
✅ Project folders are automatically created  
✅ PDFs are saved with format: `ProjectNumber-TaskName.pdf`  
✅ System handles errors gracefully  
✅ No disruption to existing workflows  
✅ Works on Windows (primary) and cross-platform  
✅ OneDrive sync works correctly  

---

## 12. Appendix

### 12.1 Example File Structure

```
C:\Users\Client\OneDrive\Projects\
├── 02-2026-4001\
│   ├── 02-2026-4001-Rebar Inspection.pdf
│   ├── 02-2026-4001-Compressive Strength.pdf
│   └── 02-2026-4001-Density Measurement.pdf
├── 02-2026-4002\
│   └── 02-2026-4002-Proctor 1.pdf
└── 02-2026-4003\
    └── 02-2026-4003-Cylinder Pickup.pdf
```

### 12.2 API Endpoints Summary

```
GET  /api/settings/onedrive-path
POST /api/settings/onedrive-path
GET  /api/settings/onedrive-status
POST /api/projects (enhanced - auto-creates folder)
GET  /api/pdf/* (enhanced - new naming)
```

### 12.3 Key Files Reference

**New Files:**
- `server/routes/settings.js`
- `server/services/onedriveService.js`
- `client/src/components/admin/Settings.tsx`
- `client/src/api/settings.ts`

**Modified Files:**
- `server/routes/projects.js`
- `server/utils/pdfFileManager.js`
- `server/routes/pdf.js`
- `server/routes/proctor.js`
- Database migrations

---

**End of Planning Document**

*This plan provides a comprehensive roadmap for implementing OneDrive integration and enhanced PDF naming. The implementation should follow agile principles with iterative development and continuous testing.*
