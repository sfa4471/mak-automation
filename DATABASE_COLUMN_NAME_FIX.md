# Database Column Name Conversion Fix

**Issue:** `column notifications.userId does not exist`  
**Root Cause:** Database adapter was using `keysToSnakeCase()` on single key strings instead of `toSnakeCase()`  
**Status:** ✅ Fixed

---

## 🔍 **Problem Identified**

The error occurred because:
1. Supabase uses **snake_case** column names (`user_id`, `is_read`)
2. Application code uses **camelCase** (`userId`, `isRead`)
3. The database adapter was calling `keysToSnakeCase("userId")` which expects an object, not a string
4. This caused `userId` to remain as `userId` instead of converting to `user_id`

---

## ✅ **Fix Applied**

Updated `server/db/index.js` to use `toSnakeCase()` for single key conversions:

**Before:**
```javascript
query = query.eq(keysToSnakeCase(key), value);  // ❌ Wrong - expects object
```

**After:**
```javascript
query = query.eq(toSnakeCase(key), value);  // ✅ Correct - converts string
```

**Files Modified:**
- `server/db/index.js` - Fixed all `.eq()` calls to use `toSnakeCase()` instead of `keysToSnakeCase()`

---

## 📋 **What This Fixes**

This fix resolves the error:
```
Error: Database error: column notifications.userId does not exist
```

Now the following queries will work correctly:
- ✅ `db.all('notifications', { userId: 1, isRead: 0 })` → converts to `user_id` and `is_read`
- ✅ `db.get('notifications', { userId: 1 })` → converts to `user_id`
- ✅ `db.update('notifications', { isRead: 1 }, { userId: 1 })` → converts all keys properly

---

## 🚀 **Next Steps**

1. **Deploy the fix:**
   - The fix is in `server/db/index.js`
   - Commit and push to trigger Render redeploy
   - Or manually redeploy in Render Dashboard

2. **Verify the fix:**
   - After redeploy, check Render logs
   - Should NOT see: `column notifications.userId does not exist`
   - Notifications should load correctly

3. **Test notifications:**
   - Login to the application
   - Check if notifications load without errors
   - Verify unread count works

---

## 🔍 **Additional Notes**

### Column Name Conversions

The fix ensures proper conversion:
- `userId` → `user_id` ✅
- `isRead` → `is_read` ✅
- `relatedTaskId` → `related_task_id` ✅
- `relatedProjectId` → `related_project_id` ✅
- `createdAt` → `created_at` ✅

### Other Tables

This fix applies to all tables, not just notifications:
- ✅ `users` table queries
- ✅ `projects` table queries
- ✅ `tasks` table queries
- ✅ `workpackages` table queries
- ✅ All other tables using the database adapter

---

## ✅ **Verification**

After deployment, verify:
1. No errors in Render logs about missing columns
2. Notifications endpoint works: `/api/notifications`
3. Unread count works: `/api/notifications/unread-count`
4. Projects load correctly (already working based on logs)

---

**Fix Applied:** February 1, 2026  
**Status:** Ready for deployment
