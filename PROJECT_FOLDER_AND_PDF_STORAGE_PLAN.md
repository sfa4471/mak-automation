# Project Folder Creation and PDF Storage Integration Plan

**Planning Agent:** Senior Software Engineer (20+ years experience)  
**Date:** 2025-02-01  
**Status:** Planning Phase

---

## Executive Summary

This plan outlines the implementation strategy for automatically creating project folders when a user clicks "Create Project" and ensuring PDFs are stored in the correct location based on user-configured workflow settings. The solution integrates with the existing `app_settings` table and `pdfFileManager` utility to provide a seamless, configurable file storage system.

---

## 1. Current State Analysis

### 1.1 Existing Infrastructure

**Database:**
- `app_settings` table exists with key-value storage
- Currently stores `onedrive_base_path` setting
- Migration file: `supabase/migrations/20250201000000_add_app_settings.sql`

**Backend Services:**
- `server/utils/pdfFileManager.js` - Handles PDF storage logic
  - `getEffectiveBasePath()` - Gets base path (OneDrive or default)
  - `ensureProjectDirectory(projectNumber)` - Creates project folder structure
  - `saveReportPDF()` - Saves PDFs with proper naming convention
- `server/routes/projects.js` - Project creation endpoint
  - Already calls `ensureProjectDirectory()` at line 361
  - Creates OneDrive folder if configured (lines 369-386)

**Frontend:**
- `client/src/components/admin/Settings.tsx` - Settings UI
  - Currently only handles OneDrive path configuration
  - Needs expansion for "Workflow" settings section

**PDF Naming Convention:**
- Format: `<ProjectNumber>_<TestType>_<Sequence>_Field_<Date>.pdf`
- Example: `MAK-2025-8188_CompressiveStrength_01_Field_20250115.pdf`
- Handles revisions: `_REV1`, `_REV2`, etc.
- Sequence numbers auto-increment per test type

**Folder Structure:**
```
<BasePath>/
  └── <ProjectNumber>/
      ├── Proctor/
      ├── Density/
      ├── CompressiveStrength/
      ├── Rebar/
      └── CylinderPickup/
```

### 1.2 Current Gaps

1. **Settings UI Limitation:**
   - Settings page only shows "OneDrive Integration" section
   - No "Workflow" section for general folder location
   - User cannot configure a custom base path (non-OneDrive)

2. **Path Resolution Logic:**
   - `getEffectiveBasePath()` only checks OneDrive or falls back to `PDF_BASE_PATH` env var
   - No user-configurable base path option in `app_settings`

3. **Project Creation Flow:**
   - Folder creation happens but may not use user's preferred location
   - No validation that folder was created successfully before project save

---

## 2. Requirements

### 2.1 Functional Requirements

**FR1: Project Folder Creation**
- When user clicks "Create Project", system MUST:
  1. Create project in database
  2. Retrieve workflow folder location from `app_settings` (key: `workflow_base_path`)
  3. Create folder structure at: `<workflow_base_path>/<ProjectNumber>/`
  4. Create all test type subdirectories (Proctor, Density, CompressiveStrength, etc.)
  5. Handle errors gracefully (log but don't fail project creation)

**FR2: PDF Storage Location**
- When user clicks "Create PDF", system MUST:
  1. Retrieve workflow folder location from `app_settings`
  2. Use existing `saveReportPDF()` function which already handles:
     - Project folder creation if missing
     - Test type subdirectory selection
     - Sequence number calculation
     - Revision handling
  3. Store PDF at: `<workflow_base_path>/<ProjectNumber>/<TestType>/<PDF_Filename>`

**FR3: Settings Configuration**
- Settings page MUST have a "Workflow" section with:
  1. "Project Folder Location" input field
  2. Path validation (exists, writable)
  3. Test button to verify path
  4. Save button to persist to `app_settings` table
  5. Display current status (configured, path, valid, writable)

**FR4: Path Resolution Priority**
- System MUST resolve base path in this order:
  1. `workflow_base_path` from `app_settings` (if set)
  2. `onedrive_base_path` from `app_settings` (if set) - for backward compatibility
  3. `PDF_BASE_PATH` environment variable
  4. Default: `./pdfs` in project root

### 2.2 Non-Functional Requirements

**NFR1: Backward Compatibility**
- Existing OneDrive integration must continue to work
- Projects created before this change must still be accessible
- PDFs in old locations must still be readable

**NFR2: Error Handling**
- Folder creation failures should not block project creation
- Clear error messages for invalid paths
- Graceful fallback to default location if configured path fails

**NFR3: Performance**
- Folder creation should be asynchronous
- No blocking operations during project creation
- Path validation should be fast (< 1 second)

**NFR4: Security**
- Path validation must prevent directory traversal attacks
- Sanitize user-provided paths
- Validate paths are within allowed directories (if needed)

---

## 3. Architecture & Design

### 3.1 Database Schema

**Existing `app_settings` Table:**
```sql
CREATE TABLE app_settings (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by_user_id BIGINT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**New Setting Key:**
- `workflow_base_path` - User-configured base folder for project storage
- Description: "Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location."

### 3.2 Backend Architecture

**Modified Files:**

1. **`server/utils/pdfFileManager.js`**
   - Modify `getEffectiveBasePath()` to check `workflow_base_path` first
   - Priority: `workflow_base_path` → `onedrive_base_path` → `PDF_BASE_PATH` → default

2. **`server/routes/projects.js`**
   - No changes needed (already calls `ensureProjectDirectory()`)
   - Folder creation will automatically use new path resolution

3. **`server/routes/settings.js`** (if exists) or create new
   - Add endpoint: `GET /api/settings/workflow/path`
   - Add endpoint: `POST /api/settings/workflow/path`
   - Add endpoint: `POST /api/settings/workflow/path/test`

**Path Resolution Flow:**
```
getEffectiveBasePath()
  ├─ Check app_settings: workflow_base_path
  │  └─ If valid & writable → return
  ├─ Check app_settings: onedrive_base_path (backward compat)
  │  └─ If valid & writable → return
  ├─ Check PDF_BASE_PATH env var
  │  └─ If set → return
  └─ Return default: ./pdfs
```

### 3.3 Frontend Architecture

**Modified Files:**

1. **`client/src/components/admin/Settings.tsx`**
   - Add new "Workflow" section
   - Reuse existing OneDrive UI patterns
   - Add workflow path input, test, and save functionality

2. **`client/src/api/settings.ts`** (if exists) or create
   - Add `getWorkflowPath()` method
   - Add `setWorkflowPath(path: string | null)` method
   - Add `testWorkflowPath(path: string)` method

**UI Structure:**
```
Settings Page
├─ OneDrive Integration (existing)
│  └─ OneDrive Base Path
└─ Workflow Settings (NEW)
   └─ Project Folder Location
      ├─ Input field
      ├─ Test button
      ├─ Save button
      └─ Status display
```

### 3.4 Data Flow

**Project Creation Flow:**
```
User clicks "Create Project"
  ↓
Frontend: POST /api/projects
  ↓
Backend: Create project in database
  ↓
Backend: ensureProjectDirectory(projectNumber)
  ↓
Backend: getEffectiveBasePath()
  ├─ Query app_settings: workflow_base_path
  ├─ If not set, check onedrive_base_path
  └─ If not set, use PDF_BASE_PATH or default
  ↓
Backend: Create folder structure
  ↓
Backend: Return project data
```

**PDF Creation Flow:**
```
User clicks "Create PDF"
  ↓
Frontend: GET /api/pdf/wp1/:id
  ↓
Backend: Generate PDF buffer
  ↓
Backend: saveReportPDF(projectNumber, taskType, fieldDate, pdfBuffer)
  ↓
Backend: getEffectiveBasePath() (same as above)
  ↓
Backend: Ensure project directory exists
  ↓
Backend: Save PDF to <BasePath>/<ProjectNumber>/<TestType>/<Filename>
  ↓
Backend: Return PDF + save info
```

---

## 4. Implementation Plan

### Phase 1: Backend - Path Resolution Enhancement

**Step 1.1: Update `pdfFileManager.js`**
- Modify `getEffectiveBasePath()` to check `workflow_base_path` first
- Add helper function `getWorkflowBasePath()` to query `app_settings`
- Maintain backward compatibility with OneDrive path

**Step 1.2: Create/Update Settings API Routes**
- Create `server/routes/settings.js` if it doesn't exist
- Add endpoints for workflow path management:
  - `GET /api/settings/workflow/path` - Get current workflow path
  - `POST /api/settings/workflow/path` - Set workflow path
  - `POST /api/settings/workflow/path/test` - Test path validity

**Step 1.3: Add Database Migration (if needed)**
- Check if `workflow_base_path` default entry exists in `app_settings`
- If not, add migration or update existing migration

### Phase 2: Frontend - Settings UI Enhancement

**Step 2.1: Update Settings API Client**
- Add methods to `client/src/api/settings.ts`:
  - `getWorkflowPath()`
  - `setWorkflowPath(path)`
  - `testWorkflowPath(path)`

**Step 2.2: Enhance Settings Component**
- Add "Workflow Settings" section to `Settings.tsx`
- Implement workflow path input, test, and save functionality
- Reuse existing UI patterns from OneDrive section

**Step 2.3: Update Settings Route**
- Ensure `/admin/settings` route exists in `App.tsx`
- Verify Settings component is properly protected (admin only)

### Phase 3: Testing & Validation

**Step 3.1: Unit Tests**
- Test path resolution priority
- Test folder creation with different path configurations
- Test error handling for invalid paths

**Step 3.2: Integration Tests**
- Test project creation with workflow path set
- Test PDF creation and storage location
- Test path validation and error messages

**Step 3.3: Manual Testing**
- Create project with workflow path configured
- Verify folder structure created correctly
- Create PDF and verify it's saved in correct location
- Test with OneDrive path (backward compatibility)
- Test with no path configured (default behavior)

### Phase 4: Documentation & Deployment

**Step 4.1: Update Documentation**
- Update README with workflow settings information
- Document path resolution priority
- Add troubleshooting guide for path issues

**Step 4.2: Database Migration**
- Ensure `workflow_base_path` entry exists in `app_settings`
- Run migration on production database

---

## 5. Detailed Implementation Steps

### 5.1 Backend: Update `pdfFileManager.js`

**File:** `server/utils/pdfFileManager.js`

**Changes:**
1. Add `getWorkflowBasePath()` async function to query `app_settings`
2. Modify `getEffectiveBasePath()` to check workflow path first
3. Maintain existing OneDrive fallback logic

**Code Structure:**
```javascript
// New function to get workflow base path from app_settings
async function getWorkflowBasePath() {
  try {
    const db = require('../db');
    const setting = await db.get('app_settings', { key: 'workflow_base_path' });
    if (setting && setting.value) {
      return setting.value;
    }
    return null;
  } catch (error) {
    console.warn('Error getting workflow base path:', error.message);
    return null;
  }
}

// Modified getEffectiveBasePath()
async function getEffectiveBasePath() {
  // Priority 1: workflow_base_path from app_settings
  const workflowPath = await getWorkflowBasePath();
  if (workflowPath) {
    // Validate path
    if (fs.existsSync(workflowPath)) {
      try {
        // Test writability
        fs.accessSync(workflowPath, fs.constants.W_OK);
        return workflowPath;
      } catch (error) {
        console.warn('Workflow path exists but is not writable:', workflowPath);
      }
    } else {
      console.warn('Workflow path does not exist:', workflowPath);
    }
  }
  
  // Priority 2: OneDrive path (backward compatibility)
  const service = getOneDriveService();
  if (service) {
    try {
      const onedrivePath = await service.getBasePath();
      if (onedrivePath) {
        const status = await service.getPathStatus();
        if (status.valid && status.isWritable) {
          return onedrivePath;
        }
      }
    } catch (error) {
      console.warn('Error getting OneDrive path:', error.message);
    }
  }
  
  // Priority 3: Environment variable
  if (PDF_BASE_PATH) {
    return PDF_BASE_PATH;
  }
  
  // Priority 4: Default
  return path.join(__dirname, '..', 'pdfs');
}
```

### 5.2 Backend: Create Settings API Routes

**File:** `server/routes/settings.js` (create or update)

**Endpoints:**
```javascript
// GET /api/settings/workflow/path
router.get('/workflow/path', authenticate, requireAdmin, async (req, res) => {
  // Get workflow_base_path from app_settings
});

// POST /api/settings/workflow/path
router.post('/workflow/path', authenticate, requireAdmin, async (req, res) => {
  // Set workflow_base_path in app_settings
  // Validate path exists and is writable
});

// POST /api/settings/workflow/path/test
router.post('/workflow/path/test', authenticate, requireAdmin, async (req, res) => {
  // Test path without saving
  // Return validation result
});
```

### 5.3 Frontend: Update Settings API Client

**File:** `client/src/api/settings.ts` (create or update)

**Methods:**
```typescript
export const settingsAPI = {
  // Existing OneDrive methods...
  
  // Workflow path methods
  getWorkflowPath: async (): Promise<{ success: boolean; path?: string | null }> => {
    // GET /api/settings/workflow/path
  },
  
  setWorkflowPath: async (path: string | null): Promise<{ success: boolean; message?: string; error?: string }> => {
    // POST /api/settings/workflow/path
  },
  
  testWorkflowPath: async (path: string): Promise<{ isValid: boolean; isWritable: boolean; error?: string }> => {
    // POST /api/settings/workflow/path/test
  }
};
```

### 5.4 Frontend: Enhance Settings Component

**File:** `client/src/components/admin/Settings.tsx`

**Changes:**
- Add "Workflow Settings" section after OneDrive section
- Reuse UI patterns from OneDrive section
- Add state management for workflow path
- Implement test and save handlers

**UI Addition:**
```tsx
<div className="settings-section">
  <h2>Workflow Settings</h2>
  <p className="settings-description">
    Configure the base folder location for project folders and PDFs. 
    This location will be used when creating new projects and saving PDFs.
  </p>
  
  {/* Similar UI to OneDrive section */}
</div>
```

---

## 6. Error Handling & Edge Cases

### 6.1 Path Validation

**Invalid Path Scenarios:**
1. Path doesn't exist → Show error, don't save
2. Path exists but not writable → Show error, don't save
3. Path is a file (not directory) → Show error, don't save
4. Path contains invalid characters → Sanitize or reject
5. Path is outside allowed directory (if security policy) → Reject

**Validation Function:**
```javascript
function validatePath(path) {
  if (!path || typeof path !== 'string') {
    return { isValid: false, error: 'Path is required' };
  }
  
  if (!fs.existsSync(path)) {
    return { isValid: false, error: 'Path does not exist' };
  }
  
  const stats = fs.statSync(path);
  if (!stats.isDirectory()) {
    return { isValid: false, error: 'Path is not a directory' };
  }
  
  try {
    fs.accessSync(path, fs.constants.W_OK);
    return { isValid: true, isWritable: true };
  } catch (error) {
    return { isValid: true, isWritable: false, error: 'Path is not writable' };
  }
}
```

### 6.2 Folder Creation Failures

**Scenarios:**
1. Disk full → Log error, continue (don't fail project creation)
2. Permission denied → Log error, continue
3. Network path unavailable → Log error, continue
4. Path too long (Windows) → Log error, continue

**Error Handling:**
```javascript
try {
  const folderPath = await ensureProjectDirectory(projectNumber);
  console.log(`✅ Project folder created: ${folderPath}`);
} catch (folderError) {
  console.error('❌ Error creating project folder:', folderError);
  // Continue with project creation - folder can be created later
  // User can manually create folder or fix path in settings
}
```

### 6.3 Backward Compatibility

**Migration Strategy:**
1. Existing projects with OneDrive path → Continue to work
2. Projects created before workflow path setting → Use OneDrive or default
3. PDFs in old locations → Still accessible (no migration needed)
4. Settings page → Show both OneDrive and Workflow sections

---

## 7. Testing Strategy

### 7.1 Unit Tests

**Test Cases:**
1. `getEffectiveBasePath()` priority order
2. Path validation with various inputs
3. Folder creation with different base paths
4. Error handling for invalid paths

### 7.2 Integration Tests

**Test Scenarios:**
1. Create project with workflow path set → Verify folder created
2. Create PDF → Verify saved in correct location
3. Change workflow path → Verify new projects use new path
4. Remove workflow path → Verify fallback to OneDrive/default
5. Invalid workflow path → Verify fallback works

### 7.3 Manual Testing Checklist

- [ ] Configure workflow path in Settings
- [ ] Test path validation (valid, invalid, non-writable)
- [ ] Create new project → Verify folder created at workflow path
- [ ] Create PDF → Verify saved in project folder
- [ ] Change workflow path → Create new project → Verify new location
- [ ] Remove workflow path → Verify fallback to OneDrive/default
- [ ] Test with OneDrive path still configured (backward compat)
- [ ] Test with no paths configured (default behavior)

---

## 8. Deployment Considerations

### 8.1 Database Migration

**Action Required:**
- Ensure `workflow_base_path` entry exists in `app_settings` table
- Can be added via migration or manually:
  ```sql
  INSERT INTO app_settings (key, value, description) 
  VALUES ('workflow_base_path', NULL, 'Base folder path for project folders and PDFs. Leave empty to use OneDrive or default location.')
  ON CONFLICT (key) DO NOTHING;
  ```

### 8.2 Environment Variables

**No Changes Required:**
- `PDF_BASE_PATH` env var still works as fallback
- Existing OneDrive configuration continues to work

### 8.3 Rollback Plan

**If Issues Arise:**
1. Revert code changes
2. `workflow_base_path` setting can be ignored (system falls back)
3. Existing projects and PDFs unaffected
4. No data migration needed

---

## 9. Success Criteria

### 9.1 Functional Success

✅ User can configure workflow folder location in Settings  
✅ Project folders are created at configured location when "Create Project" is clicked  
✅ PDFs are saved in correct project folder when "Create PDF" is clicked  
✅ Path validation works correctly (valid/invalid/writable checks)  
✅ Backward compatibility maintained (OneDrive integration still works)

### 9.2 Technical Success

✅ Path resolution follows correct priority order  
✅ Error handling prevents project creation failures  
✅ Folder creation is asynchronous and non-blocking  
✅ Settings API endpoints work correctly  
✅ UI provides clear feedback on path status

---

## 10. Timeline Estimate

**Phase 1: Backend (2-3 hours)**
- Update `pdfFileManager.js` path resolution
- Create/update Settings API routes
- Add database migration if needed

**Phase 2: Frontend (2-3 hours)**
- Update Settings API client
- Enhance Settings component UI
- Test UI interactions

**Phase 3: Testing (1-2 hours)**
- Manual testing of all scenarios
- Integration testing
- Bug fixes

**Total Estimated Time: 5-8 hours**

---

## 11. Risk Assessment

### 11.1 Low Risk
- ✅ Backward compatibility maintained
- ✅ No breaking changes to existing functionality
- ✅ Graceful error handling

### 11.2 Medium Risk
- ⚠️ Path validation edge cases (mitigated by thorough testing)
- ⚠️ Cross-platform path handling (Windows/Linux/Mac)

### 11.3 Mitigation Strategies
- Comprehensive path validation
- Extensive error logging
- Fallback mechanisms at every level
- User-friendly error messages

---

## 12. Future Enhancements

**Potential Improvements:**
1. Path browser/selector UI (instead of manual input)
2. Multiple path support (primary + backup)
3. Path migration tool (move existing projects)
4. Path usage statistics (how many projects in each path)
5. Automatic path health checks and notifications

---

## Conclusion

This plan provides a comprehensive, production-ready approach to implementing project folder creation and PDF storage based on user-configured workflow settings. The solution maintains backward compatibility, includes robust error handling, and follows existing code patterns for consistency.

The implementation is straightforward, low-risk, and can be completed in a single development session with proper testing.

---

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1 implementation (Backend)
3. Proceed to Phase 2 (Frontend)
4. Complete Phase 3 (Testing)
5. Deploy to production
