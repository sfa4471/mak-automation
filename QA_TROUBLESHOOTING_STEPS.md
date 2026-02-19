# QA Troubleshooting: Folder Not Created

## Critical: Check Server Logs

The frontend is sending data correctly. **We need to see the BACKEND server logs** to identify the issue.

### Step 1: Check Server Console

When you create a project, you should see these logs in your **server console** (not browser console):

```
💾 Saving project data: { projectNumber: '02-2026-XXXX', ... }
📁 Creating project folder for: 02-2026-XXXX
🔍 [DIAGNOSTIC] ensureProjectDirectory() called with projectNumber: 02-2026-XXXX
🔍 [DIAGNOSTIC] Step 1: Getting effective base path
🔍 [DIAGNOSTIC] getWorkflowBasePath() called
🔍 [DIAGNOSTIC] Database module loaded, isSupabase: true/false
🔍 [DIAGNOSTIC] Database query result: { found: true/false, value: "..." }
```

**If you DON'T see these logs:**
- ❌ Backend is not receiving the request
- Check: Is server running? Is API endpoint correct?

**If you see logs but they stop at a certain point:**
- ❌ That's where the issue is
- Share the last log message you see

---

## Step 2: Test Database Query

Run this in your server console or create a test file:

```javascript
// test-db-query.js
const db = require('./server/db');

(async () => {
  console.log('Testing database query...');
  console.log('Is Supabase:', db.isSupabase());
  
  const setting = await db.get('app_settings', { key: 'workflow_base_path' });
  console.log('Setting:', setting);
  console.log('Value:', setting?.value);
  
  if (!setting || !setting.value) {
    console.log('❌ WORKFLOW PATH NOT CONFIGURED!');
    console.log('You need to configure it in Settings UI or run:');
    console.log(`
INSERT INTO app_settings (key, value) 
VALUES ('workflow_base_path', 'C:\\\\Users\\\\fadyn\\\\OneDrive\\\\Desktop\\\\MAK_DRIVE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
    `);
  } else {
    console.log('✅ Workflow path configured:', setting.value);
  }
})();
```

Run: `node test-db-query.js`

---

## Step 3: Test Folder Creation Manually

I've created `test-folder-creation-manual.js` - run it:

```bash
node test-folder-creation-manual.js
```

This will:
1. Test database query
2. Test if path exists
3. Test if path is writable
4. Test folder creation
5. Show exact errors if any

---

## Step 4: Use Diagnostic Endpoint

1. Make sure you're logged in as Admin
2. Open browser and go to: `http://localhost:5000/api/projects/diagnostic/folder-creation`
3. Check the JSON response

**Expected response:**
```json
{
  "success": true,
  "diagnostics": {
    "steps": [
      { "step": 1, "name": "Database Connection", "status": "success" },
      { "step": 2, "name": "Get Workflow Path", "status": "success", "result": "C:\\Users\\..." },
      { "step": 3, "name": "Validate Path", "status": "success" },
      { "step": 4, "name": "Test Folder Creation", "status": "success" },
      { "step": 5, "name": "Test Project Folder Creation", "status": "success" }
    ]
  }
}
```

**If any step fails, that's your issue!**

---

## Common Issues and Quick Fixes

### Issue 1: No Server Logs Appearing

**Symptom:** Frontend sends request but no backend logs

**Check:**
- Is server running? `npm start` or `node server/index.js`
- Is request reaching backend? Check Network tab → POST /api/projects
- Is there an error before folder creation code?

**Fix:**
- Restart server
- Check server is listening on correct port
- Check CORS settings

---

### Issue 2: Database Query Returns Null

**Symptom:** `🔍 [DIAGNOSTIC] No path found, returning null`

**Check:**
```sql
SELECT * FROM app_settings WHERE key = 'workflow_base_path';
```

**Fix:**
If NULL, insert the path:
```sql
INSERT INTO app_settings (key, value, description) 
VALUES ('workflow_base_path', 'C:\Users\fadyn\OneDrive\Desktop\MAK_DRIVE', 'Base folder path for project folders')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

---

### Issue 3: Path Validation Fails

**Symptom:** `🔍 [DIAGNOSTIC] Path validation failed`

**Check:**
- Does path exist? Open File Explorer and navigate to it
- Is OneDrive syncing? Check OneDrive icon in system tray
- Are permissions correct? Right-click folder → Properties → Security

**Fix:**
- Create path if it doesn't exist
- Ensure OneDrive is syncing
- Check folder permissions

---

### Issue 4: Folder Creation Fails Silently

**Symptom:** `mkdirSync` called but folder doesn't exist

**Check:**
- OneDrive sync status
- Path permissions
- Path format (backslashes, etc.)

**Fix:**
- Wait for OneDrive to sync
- Check if folder appears after a few seconds
- Verify path format is correct

---

## What to Share

To help diagnose, please share:

1. **Server console logs** when creating a project (all `🔍 [DIAGNOSTIC]` messages)
2. **Result of diagnostic endpoint** (`/api/projects/diagnostic/folder-creation`)
3. **Result of manual test** (`node test-folder-creation-manual.js`)
4. **Database query result:**
   ```sql
   SELECT * FROM app_settings WHERE key = 'workflow_base_path';
   ```

---

## Quick Test Commands

```bash
# Test database query
node -e "const db = require('./server/db'); db.get('app_settings', { key: 'workflow_base_path' }).then(s => console.log(s));"

# Test folder creation manually
node test-folder-creation-manual.js

# Check if server is running
curl http://localhost:5000/api/health
```

---

**Next Step:** Run the manual test script and share the results!
