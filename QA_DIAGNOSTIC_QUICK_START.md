# QA Diagnostic Quick Start Guide

## How to Diagnose Folder Creation Issue

### Step 1: Check Server Logs

When you create a project, watch the server console for diagnostic messages:

**Look for these messages:**
```
🔍 [DIAGNOSTIC] getWorkflowBasePath() called
🔍 [DIAGNOSTIC] Database module loaded, isSupabase: true/false
🔍 [DIAGNOSTIC] Database query result: { found: true/false, value: "..." }
🔍 [DIAGNOSTIC] ensureProjectDirectory() called with projectNumber: 02-2026-XXXX
🔍 [DIAGNOSTIC] Step 1: Getting effective base path
🔍 [DIAGNOSTIC] Base path determined: C:\Users\...
🔍 [DIAGNOSTIC] Step 2: Validating base path
🔍 [DIAGNOSTIC] Path validation result: { valid: true/false, ... }
🔍 [DIAGNOSTIC] Step 6: Creating project directory
🔍 [DIAGNOSTIC] Project directory path: C:\Users\...
🔍 [DIAGNOSTIC] Calling mkdirSync with recursive: true
🔍 [DIAGNOSTIC] mkdirSync completed, checking if folder exists now
```

### Step 2: Use Diagnostic Endpoint

**Access:** `GET /api/projects/diagnostic/folder-creation`

**How to use:**
1. Make sure you're logged in as Admin
2. Open browser DevTools → Network tab
3. Navigate to: `http://localhost:5000/api/projects/diagnostic/folder-creation`
4. Check the response JSON

**Expected Response:**
```json
{
  "success": true,
  "diagnostics": {
    "steps": [
      {
        "step": 1,
        "name": "Database Connection",
        "status": "success",
        "isSupabase": true
      },
      {
        "step": 2,
        "name": "Get Workflow Path",
        "status": "success",
        "result": "C:\\Users\\fadyn\\OneDrive\\Desktop\\MAK_DRIVE"
      },
      {
        "step": 3,
        "name": "Validate Path",
        "status": "success",
        "result": { "valid": true, "isWritable": true }
      },
      {
        "step": 4,
        "name": "Test Folder Creation",
        "status": "success",
        "result": { "created": true, "exists": true, "isDirectory": true, "writable": true }
      },
      {
        "step": 5,
        "name": "Test Project Folder Creation",
        "status": "success",
        "result": {
          "success": true,
          "path": "C:\\Users\\fadyn\\OneDrive\\Desktop\\MAK_DRIVE\\02-2026-TEST",
          "error": null,
          "warnings": []
        }
      }
    ],
    "errors": [],
    "warnings": []
  }
}
```

### Step 3: Check Database

**In Supabase SQL Editor, run:**
```sql
SELECT * FROM app_settings WHERE key = 'workflow_base_path';
```

**Expected:**
- One row with `key = 'workflow_base_path'`
- `value = 'C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE'`

**If NULL or missing:**
- ❌ **ISSUE:** Path not configured
- **Fix:** Go to Settings UI and configure workflow path

### Step 4: Common Issues and Solutions

#### Issue 1: Database Query Returns Null
**Symptoms:**
- Diagnostic shows: `"found": false` or `"value": null`
- Server logs: `🔍 [DIAGNOSTIC] No path found, returning null`

**Solution:**
1. Check Supabase connection
2. Verify `app_settings` table exists
3. Insert/update workflow path:
   ```sql
   INSERT INTO app_settings (key, value) 
   VALUES ('workflow_base_path', 'C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE')
   ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
   ```

#### Issue 2: Path Validation Fails
**Symptoms:**
- Diagnostic shows: `"valid": false` or `"isWritable": false`
- Server logs: `🔍 [DIAGNOSTIC] Path validation failed`

**Solution:**
1. Verify path exists: Open File Explorer and navigate to path
2. Check OneDrive sync status
3. Verify write permissions
4. Test path manually (see Step 5)

#### Issue 3: Folder Creation Fails
**Symptoms:**
- Diagnostic shows: `"created": false` or error in step 4
- Server logs: `🔍 [DIAGNOSTIC] mkdirSync completed` but folder doesn't exist

**Solution:**
1. Check OneDrive sync status
2. Verify path permissions
3. Check for path length issues (Windows 260 char limit)
4. Test manual folder creation (see Step 5)

#### Issue 4: Verification Fails
**Symptoms:**
- Folder created but verification fails
- Server logs: `🔍 [DIAGNOSTIC] Original path exists after creation: false`

**Solution:**
1. OneDrive sync delay - wait a few seconds
2. Check if folder exists with normalized path
3. Verify path format consistency

### Step 5: Manual Testing

Create a test file `test-folder.js`:

```javascript
const fs = require('fs');
const path = require('path');

const testPath = 'C:\\Users\\fadyn\\OneDrive\\Desktop\\MAK_DRIVE';
const testFolder = path.join(testPath, 'TEST_FOLDER_' + Date.now());

console.log('=== Manual Folder Creation Test ===');
console.log('Test path:', testPath);
console.log('Path exists:', fs.existsSync(testPath));
console.log('Is directory:', fs.existsSync(testPath) && fs.statSync(testPath).isDirectory());

try {
  fs.accessSync(testPath, fs.constants.W_OK);
  console.log('✅ Path is writable');
} catch (error) {
  console.log('❌ Path is NOT writable:', error.message);
}

try {
  console.log('\nCreating test folder:', testFolder);
  fs.mkdirSync(testFolder, { recursive: true });
  console.log('✅ Folder created');
  console.log('Folder exists:', fs.existsSync(testFolder));
  
  // Test write
  const testFile = path.join(testFolder, 'test.txt');
  fs.writeFileSync(testFile, 'test');
  console.log('✅ Write test passed');
  fs.unlinkSync(testFile);
  fs.rmdirSync(testFolder);
  console.log('✅ Cleanup successful');
} catch (error) {
  console.log('❌ Error:', error.message);
  console.log('Stack:', error.stack);
}
```

Run: `node test-folder.js`

### Step 6: Check Response in Browser

1. Open browser DevTools → Network tab
2. Create a project
3. Find POST request to `/api/projects`
4. Check Response tab
5. Look for `folderCreation` object:

```json
{
  "folderCreation": {
    "success": true/false,
    "path": "C:\\Users\\...",
    "error": null,
    "warnings": []
  }
}
```

**If `success: false`:**
- Check `error` field for details
- Check server logs for diagnostic messages

**If `success: true` but folder doesn't exist:**
- Check `warnings` array for OneDrive sync warnings
- Wait a few seconds for OneDrive to sync
- Check folder location manually

---

## Quick Diagnostic Checklist

- [ ] Server logs show diagnostic messages
- [ ] Database query returns workflow path
- [ ] Path validation passes
- [ ] Test folder creation succeeds
- [ ] Project folder creation succeeds
- [ ] Response includes folderCreation object
- [ ] Frontend displays correct status
- [ ] Folder actually exists in File Explorer

---

## Where to Look for Issues

### Backend Issues:
- ❌ Database query fails → Check Supabase connection
- ❌ Path validation fails → Check path exists and permissions
- ❌ Folder creation fails → Check OneDrive sync, permissions
- ❌ Verification fails → Check OneDrive sync delay

### Frontend Issues:
- ❌ Response not received → Check network tab
- ❌ Status not displayed → Check CreateProject.tsx
- ❌ Wrong status shown → Check response parsing

### Supabase Issues:
- ❌ app_settings table missing → Run migrations
- ❌ workflow_base_path not set → Configure in Settings UI
- ❌ Connection issues → Check environment variables

---

**Status:** Diagnostic tools ready  
**Next:** Run diagnostics and review results
