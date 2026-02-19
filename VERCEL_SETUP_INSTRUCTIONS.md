# Vercel Deployment Setup Instructions

## Current Status

✅ **Code is ready** - All configuration files exist and code is prepared  
⚠️ **Action Required** - You need to set the environment variable in Vercel dashboard

---

## Step-by-Step Setup

### Step 1: Check if Vercel is Already Connected

Based on your project files, it looks like you may already have a Vercel project at:
- https://vercel.com/fawad-akhtars-projects-8c09bd58/mak-automation

**Check this:**
1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Look for a project named "mak-automation"
3. If it exists, you're already connected ✅
4. If it doesn't exist, see Step 2 below

---

### Step 2: Connect Vercel to Your GitHub Repo (If Not Already Done)

**Only do this if you don't see your project in Vercel dashboard:**

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New"** → **"Project"**
3. Import your GitHub repository: `sfa4471/mak-automation`
4. Configure the project:
   - **Framework Preset:** Other (or leave default)
   - **Root Directory:** `client` (IMPORTANT!)
   - **Build Command:** `npm run build` (or leave default - vercel.json has it)
   - **Output Directory:** `build` (or leave default)
5. Click **"Deploy"**

---

### Step 3: Set Environment Variable (REQUIRED)

**This is the critical step you need to do:**

1. Go to your Vercel project dashboard
2. Click on **"Settings"** tab
3. Click on **"Environment Variables"** in the left sidebar
4. Click **"Add New"**
5. Add the following:
   - **Key:** `REACT_APP_API_BASE_URL`
   - **Value:** `https://your-backend-url.onrender.com/api`
     - Replace `your-backend-url.onrender.com` with your actual Render backend URL
     - Example: `https://mak-automation-backend.onrender.com/api`
   - **Environment:** Select all (Production, Preview, Development)
6. Click **"Save"**

**Important:** After adding the environment variable, you MUST redeploy:
- Go to **"Deployments"** tab
- Click **"Redeploy"** on the latest deployment
- Or wait for the next automatic deployment

---

### Step 4: Verify Deployment

1. Go to **"Deployments"** tab in Vercel
2. Wait for the latest deployment to show **"Ready"** status
3. Click on the deployment to get your frontend URL
4. Test the application:
   - Open the Vercel URL in your browser
   - Try logging in
   - Verify API calls work (check browser console for errors)

---

## What "Automatic Deployment" Means

**"Deployment will trigger automatically"** means:
- ✅ Once Vercel is connected to your GitHub repo
- ✅ Every time you push to the `main` branch
- ✅ Vercel will automatically detect the push
- ✅ Start a new build and deployment
- ✅ You don't need to manually trigger deployments

**However:**
- ⚠️ You still need to set environment variables manually (one-time setup)
- ⚠️ You still need to configure Root Directory if not set (one-time setup)

---

## Current Configuration Files

Your project has these Vercel config files:

1. **`vercel.json`** (root) - For monorepo deployment
2. **`client/vercel.json`** - For client-only deployment

**Which one is used?**
- Vercel uses the one in the **Root Directory** you set in project settings
- If Root Directory is set to `client`, it uses `client/vercel.json`
- If Root Directory is not set (root), it uses root `vercel.json`

---

## Troubleshooting

### Build Fails

**Error:** `Command "cd client && npm install" exited with 1`

**Solution:**
1. Go to Vercel Dashboard → Your Project → Settings → General
2. Set **Root Directory** to: `client`
3. Save and redeploy

### API Calls Fail

**Error:** API requests return 404 or CORS errors

**Solution:**
1. Verify `REACT_APP_API_BASE_URL` is set correctly in Vercel
2. Check that your backend URL is correct (should end with `/api`)
3. Ensure backend CORS allows your Vercel domain
4. Redeploy after changing environment variables

### Environment Variable Not Working

**Issue:** Changes to env vars don't take effect

**Solution:**
- Environment variables are only available during build time
- You MUST redeploy after adding/changing environment variables
- Go to Deployments → Redeploy

---

## Quick Checklist

- [ ] Vercel project exists and is connected to GitHub
- [ ] Root Directory is set to `client` (if needed)
- [ ] `REACT_APP_API_BASE_URL` environment variable is set
- [ ] Environment variable value points to your backend URL
- [ ] Project has been redeployed after setting env var
- [ ] Frontend URL is accessible and working

---

## Summary

**What's Already Done:**
- ✅ Code is ready (vercel.json files exist)
- ✅ Code uses environment variables correctly
- ✅ Build configuration is correct

**What You Need to Do:**
1. ⚠️ Set `REACT_APP_API_BASE_URL` in Vercel dashboard (if not already set)
2. ⚠️ Verify Root Directory is set to `client` (if needed)
3. ⚠️ Redeploy after setting environment variables

**After that:**
- ✅ Future deployments will be automatic when you push to GitHub
- ✅ No manual intervention needed for regular deployments

---

**Last Updated:** February 1, 2025
