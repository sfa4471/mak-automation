# Render Environment Variables - Quick Reference

**Your Supabase Credentials (Validated ✅)**

Use these exact values in Render Dashboard:

---

## 🔑 **Environment Variables to Add**

### Variable 1: `SUPABASE_URL`

**Key:** `SUPABASE_URL`  
**Value:** `https://hyjuxclsksbyaimvzulq.supabase.co`

---

### Variable 2: `SUPABASE_SERVICE_ROLE_KEY`

**Key:** `SUPABASE_SERVICE_ROLE_KEY`  
**Value:** `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anV4Y2xza3NieWFpbXZ6dWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg4MDIyMiwiZXhwIjoyMDg1NDU2MjIyfQ.oZxqrz-hllsT0h1_H-yLT76AZyM8X6Hy2tXY-5pQZ9Y`

---

## 📋 **Step-by-Step Instructions**

### Step 1: Open Render Dashboard
1. Go to: **https://dashboard.render.com**
2. Sign in to your account
3. Find and click on your service: **`mak-automation-backend`**

### Step 2: Navigate to Environment Tab
1. In your service dashboard, click on the **"Environment"** tab (in the left sidebar or top menu)

### Step 3: Add First Variable
1. Click the **"Add Environment Variable"** button
2. In the **Key** field, type: `SUPABASE_URL`
3. In the **Value** field, paste: `https://hyjuxclsksbyaimvzulq.supabase.co`
4. Click **"Save Changes"**

### Step 4: Add Second Variable
1. Click **"Add Environment Variable"** button again
2. In the **Key** field, type: `SUPABASE_SERVICE_ROLE_KEY`
3. In the **Value** field, paste: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5anV4Y2xza3NieWFpbXZ6dWxxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTg4MDIyMiwiZXhwIjoyMDg1NDU2MjIyfQ.oZxqrz-hllsT0h1_H-yLT76AZyM8X6Hy2tXY-5pQZ9Y`
4. Click **"Save Changes"**

### Step 5: Verify Variables
You should now see both variables in the list:
- ✅ `SUPABASE_URL` = `https://hyjuxclsksbyaimvzulq.supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` = `[219 characters]`

### Step 6: Redeploy Service
**⚠️ IMPORTANT:** After adding environment variables, you MUST redeploy:

1. Click on **"Manual Deploy"** button (top right)
2. Select **"Deploy latest commit"**
3. Wait for deployment to complete (2-5 minutes)

### Step 7: Verify Connection
1. Go to **"Logs"** tab
2. Look for these messages in the latest deployment:
   - ✅ `✅ Supabase configuration found`
   - ✅ `📊 Using Supabase database`
3. Should NOT see:
   - ❌ `⚠️ Supabase environment variables not set`
   - ❌ `📊 Using SQLite database`

---

## ✅ **Quick Checklist**

- [ ] Opened Render Dashboard
- [ ] Navigated to Environment tab
- [ ] Added `SUPABASE_URL` with value `https://hyjuxclsksbyaimvzulq.supabase.co`
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` with the full key value
- [ ] Clicked "Save Changes" for both
- [ ] Redeployed service
- [ ] Checked logs to verify Supabase connection

---

## 🔍 **Troubleshooting**

### If you see "Supabase environment variables not set" after redeploy:
1. Double-check variable names are exact (case-sensitive):
   - `SUPABASE_URL` (not `supabase_url` or `Supabase_Url`)
   - `SUPABASE_SERVICE_ROLE_KEY` (not `SUPABASE_SERVICE_KEY`)
2. Verify no extra spaces before/after values
3. Verify no quotes around values
4. Make sure you clicked "Save Changes"
5. Try clearing build cache: Settings → Clear build cache & deploy

### If connection test fails:
- Verify Supabase project is active in Supabase Dashboard
- Check that the service role key hasn't been rotated
- Ensure URL format is correct (no trailing slash)

---

**Credentials Status:** ✅ Validated and Ready  
**Last Validated:** February 1, 2026
