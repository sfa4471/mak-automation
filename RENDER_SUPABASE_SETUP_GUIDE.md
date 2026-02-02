# Render.com Supabase Configuration Guide

**Expert Setup Guide - Step-by-Step Instructions**

This guide provides exact steps to configure Supabase environment variables in Render.com for your MAK Automation backend deployment.

---

## 📋 **Prerequisites**

- Render.com account with deployed service
- Supabase account with active project
- Access to both Render Dashboard and Supabase Dashboard

---

## 🔧 **STEP 1: Get Supabase Credentials**

### 1.1 Access Supabase Dashboard

1. Go to: **https://supabase.com/dashboard**
2. Sign in to your account
3. Select your project (or create a new one if needed)

### 1.2 Navigate to API Settings

1. In your Supabase project dashboard, click on **Settings** (gear icon in left sidebar)
2. Click on **API** in the settings menu

### 1.3 Copy Required Credentials

You need two values:

1. **Project URL** (SUPABASE_URL)
   - Located in the **Project URL** section
   - Format: `https://[project-ref].supabase.co`
   - Example: `https://abcdefghijklmnop.supabase.co`
   - **Copy this entire URL**

2. **service_role key** (SUPABASE_SERVICE_ROLE_KEY)
   - Located in the **Project API keys** section
   - Find the **`service_role`** key (NOT the `anon` key)
   - **⚠️ WARNING:** This key has admin privileges - keep it secret!
   - **Copy the entire key** (it's a long string starting with `eyJ...`)

### 1.4 Verify Credentials Format

- **SUPABASE_URL** should:
  - Start with `https://`
  - Contain `.supabase.co`
  - Not end with a trailing slash

- **SUPABASE_SERVICE_ROLE_KEY** should:
  - Be a long JWT token (starts with `eyJ`)
  - Be at least 100+ characters long
  - Be the `service_role` key, NOT `anon` key

---

## 🚀 **STEP 2: Configure Environment Variables in Render**

### 2.1 Access Render Dashboard

1. Go to: **https://dashboard.render.com**
2. Sign in to your account
3. Find and click on your service: **`mak-automation-backend`**

### 2.2 Navigate to Environment Tab

1. In your service dashboard, click on the **Environment** tab
2. You'll see a list of existing environment variables (if any)

### 2.3 Add SUPABASE_URL

1. Click **"Add Environment Variable"** button
2. In the **Key** field, enter: `SUPABASE_URL`
3. In the **Value** field, paste your Supabase Project URL
   - Example: `https://abcdefghijklmnop.supabase.co`
4. Click **"Save Changes"**

### 2.4 Add SUPABASE_SERVICE_ROLE_KEY

1. Click **"Add Environment Variable"** button again
2. In the **Key** field, enter: `SUPABASE_SERVICE_ROLE_KEY`
3. In the **Value** field, paste your Supabase service_role key
   - This is the long JWT token you copied
4. Click **"Save Changes"**

### 2.5 Verify Environment Variables

You should now see both variables in the list:
- ✅ `SUPABASE_URL` = `https://[your-project].supabase.co`
- ✅ `SUPABASE_SERVICE_ROLE_KEY` = `[your-service-role-key]`

**⚠️ Important:** 
- Do NOT add quotes around the values
- Do NOT add trailing slashes to the URL
- Make sure there are no extra spaces

---

## 🔄 **STEP 3: Redeploy Service**

After adding environment variables, you must redeploy for changes to take effect.

### Option A: Manual Redeploy (Recommended)

1. In Render Dashboard, go to your service
2. Click on the **"Manual Deploy"** button (top right)
3. Select **"Deploy latest commit"**
4. Wait for deployment to complete (2-5 minutes)

### Option B: Automatic Redeploy

If you have auto-deploy enabled:
1. Make a small commit to trigger redeploy, OR
2. Wait for the next automatic deployment

### Option C: Clear Cache and Redeploy

If you suspect caching issues:
1. Go to **Settings** tab
2. Click **"Clear build cache & deploy"**
3. Wait for deployment to complete

---

## ✅ **STEP 4: Verify Connection**

### 4.1 Check Deployment Logs

1. In Render Dashboard, go to your service
2. Click on the **"Logs"** tab
3. Look for the latest deployment logs
4. You should see:

**✅ SUCCESS INDICATORS:**
```
✅ Supabase configuration found
📊 Using Supabase database
```

**❌ FAILURE INDICATORS (if still using SQLite):**
```
⚠️ Supabase environment variables not set
📊 Using SQLite database (Supabase not configured)
```

### 4.2 Test API Endpoints

Test that the API is working with Supabase:

```bash
# Health check
curl https://mak-automation-backend.onrender.com/health

# Should return: {"ok":true}
```

### 4.3 Run Verification Script (Local)

If you have the credentials locally, you can verify:

```bash
# Set environment variables locally
export SUPABASE_URL=https://your-project.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Run verification
npm run supabase:verify-connection
```

### 4.4 Verify Database Connection

The application should now:
- ✅ Connect to Supabase on startup
- ✅ Use PostgreSQL instead of SQLite
- ✅ Have access to all Supabase features (RLS, real-time, etc.)

---

## 🔍 **Troubleshooting**

### Issue: Still Using SQLite After Redeploy

**Possible Causes:**
1. Environment variables not saved correctly
2. Service not redeployed after adding variables
3. Typo in variable names or values

**Solutions:**
1. Double-check variable names are exact: `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
2. Verify values don't have quotes or extra spaces
3. Ensure you clicked "Save Changes" after adding each variable
4. Force redeploy: Settings → Clear build cache & deploy

### Issue: Invalid Credentials Error

**Possible Causes:**
1. Wrong Supabase URL format
2. Using `anon` key instead of `service_role` key
3. Project URL doesn't match your project

**Solutions:**
1. Verify URL format: `https://[project-ref].supabase.co`
2. Make sure you're using the `service_role` key from Supabase Dashboard
3. Check that the project reference in URL matches your Supabase project

### Issue: Connection Timeout

**Possible Causes:**
1. Network/firewall issues
2. Supabase project paused or deleted
3. Incorrect project URL

**Solutions:**
1. Verify Supabase project is active in Supabase Dashboard
2. Check Supabase project status
3. Verify URL is correct

---

## 📝 **Optional: Make Supabase Required**

To prevent silent fallback to SQLite in production:

1. In Render Dashboard → Environment tab
2. Add environment variable:
   - **Key:** `REQUIRE_SUPABASE`
   - **Value:** `true`
3. Redeploy service

**Effect:**
- Application will fail to start if Supabase is not configured
- Prevents accidental SQLite usage in production
- Forces proper configuration

---

## 🎯 **Quick Checklist**

- [ ] Got Supabase Project URL from Dashboard → Settings → API
- [ ] Got Supabase service_role key from Dashboard → Settings → API
- [ ] Added `SUPABASE_URL` to Render Environment variables
- [ ] Added `SUPABASE_SERVICE_ROLE_KEY` to Render Environment variables
- [ ] Redeployed service in Render
- [ ] Verified logs show "Using Supabase database"
- [ ] Tested API endpoints
- [ ] Confirmed no SQLite fallback warnings

---

## 📚 **Additional Resources**

- [Supabase Documentation](https://supabase.com/docs)
- [Render Environment Variables Guide](https://render.com/docs/environment-variables)
- [Render Deployment Guide](https://render.com/docs/deploy)

---

**Last Updated:** February 1, 2026  
**Created By:** Expert Software Engineer (20+ years experience)
