# Local Development and Deployment Guide

This guide walks you through running the application locally, testing it, committing changes, and deploying to production.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Local Setup](#step-1-local-setup)
3. [Step 2: Run Locally](#step-2-run-locally)
4. [Step 3: Test Everything](#step-3-test-everything)
5. [Step 4: Commit Changes](#step-4-commit-changes)
6. [Step 5: Deploy to Production](#step-5-deploy-to-production)

---

## Prerequisites

Before you begin, make sure you have:
- ✅ **Node.js** installed (v14 or higher)
- ✅ **Git** installed and configured
- ✅ **Supabase account** (for database) - [Sign up here](https://supabase.com)
- ✅ **GitHub account** (for version control)
- ✅ **Render.com account** (for backend deployment) - [Sign up here](https://render.com)
- ✅ **Vercel account** (for frontend deployment) - [Sign up here](https://vercel.com)

---

## Step 1: Local Setup

### 1.1 Install Dependencies

Open your terminal in the project root directory (`C:\MakAutomation`) and run:

```bash
npm run install-all
```

This installs dependencies for both the root project and the client folder.

**Expected output:**
- Root dependencies installed
- Client dependencies installed

### 1.2 Set Up Environment Variables

#### Option A: Use Supabase (Recommended for Production)

1. **Get Supabase Credentials:**
   - Go to [Supabase Dashboard](https://supabase.com/dashboard)
   - Select your project (or create a new one)
   - Navigate to **Settings → API**
   - Copy:
     - **Project URL** (e.g., `https://xxxxx.supabase.co`)
     - **service_role key** (long string starting with `eyJ...`)

2. **Create `.env` file in project root:**
   ```bash
   # Create .env file (if it doesn't exist)
   # Windows PowerShell:
   New-Item -Path .env -ItemType File -Force
   
   # Or manually create .env file in the root directory
   ```

3. **Add to `.env` file:**
   ```env
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
   PORT=5000
   JWT_SECRET=your-secret-key-here-change-this-in-production
   NODE_ENV=development
   ```

   **⚠️ Important:** 
   - Replace `your-project.supabase.co` with your actual Supabase URL
   - Replace `your-service-role-key-here` with your actual service role key
   - Use a strong random string for `JWT_SECRET` (you can generate one online)

4. **Run Database Migrations:**
   ```bash
   npm run supabase:execute-and-verify
   ```

   This creates all necessary database tables.

5. **Verify Connection:**
   ```bash
   npm run supabase:verify-connection
   ```

   You should see: `✅ Supabase connection successful`

#### Option B: Use SQLite (Quick Start for Testing)

If you want to skip Supabase setup for now:

1. **Create `.env` file** (can be empty or minimal):
   ```env
   PORT=5000
   JWT_SECRET=your-secret-key-here
   NODE_ENV=development
   ```

2. **No migrations needed** - SQLite database will be created automatically on first run.

**Note:** SQLite is fine for local testing, but use Supabase for production.

### 1.3 Set Up Client Environment (Optional)

If you want to test from a mobile device on the same network:

```bash
npm run setup-mobile
```

This auto-detects your local IP and configures the client to connect to it.

---

## Step 2: Run Locally

### 2.1 Start the Development Server

In the project root directory, run:

```bash
npm run dev
```

This starts:
- **Backend API** on `http://localhost:5000`
- **Frontend React App** on `http://localhost:3000`

**Expected output:**
```
✅ Supabase configuration found (or SQLite fallback message)
Server running on http://localhost:5000
Server also accessible on network at http://YOUR_IP:5000
```

### 2.2 Open the Application

1. **Open your browser** and go to: `http://localhost:3000`
2. You should see the login page

### 2.3 Default Login Credentials

**Admin Account:**
- Email: `admin@maklonestar.com`
- Password: `admin123`

If the admin account doesn't exist, create it:
```bash
npm run create-admin
```

---

## Step 3: Test Everything

### 3.1 Basic Functionality Tests

#### ✅ Test 1: Login
- [ ] Login as admin with default credentials
- [ ] Verify you see the Admin Dashboard

#### ✅ Test 2: Create Technician
- [ ] Click "Manage Technicians"
- [ ] Create a new technician account
- [ ] Verify technician appears in the list

#### ✅ Test 3: Create Project
- [ ] Click "Create New Project"
- [ ] Fill in project details (customer email, etc.)
- [ ] Verify project is created with auto-generated number (MAK-YYYY-####)
- [ ] Verify 5 work packages are automatically created

#### ✅ Test 4: Assign Work Package
- [ ] Go to project details
- [ ] Assign a work package to a technician
- [ ] Verify status changes to "Assigned"

#### ✅ Test 5: Technician Workflow
- [ ] Logout and login as technician
- [ ] Verify technician sees only assigned work packages
- [ ] Open a work package
- [ ] Fill in form data
- [ ] Verify autosave works (see "Saving..." then "Saved at HH:MM")
- [ ] Submit the work package
- [ ] Verify status changes to "Submitted"

#### ✅ Test 6: PDF Generation
- [ ] As technician or admin, generate PDF for a completed work package
- [ ] Verify PDF downloads and contains correct data

#### ✅ Test 7: Admin Review
- [ ] Login as admin
- [ ] View submitted work packages
- [ ] Approve a work package
- [ ] Verify status changes to "Approved"

### 3.2 Database Verification

If using Supabase:
```bash
npm run supabase:verify
```

This verifies all tables exist and are properly configured.

### 3.3 Check for Errors

- [ ] Check browser console (F12) for any JavaScript errors
- [ ] Check terminal/console for backend errors
- [ ] Test all major features work as expected

---

## Step 4: Commit Changes

### 4.1 Check Git Status

```bash
git status
```

This shows which files have been modified, added, or deleted.

### 4.2 Review Changes

```bash
# See what changed
git diff

# Or for a summary
git status -s
```

### 4.3 Stage Changes

**Option A: Stage all changes**
```bash
git add .
```

**Option B: Stage specific files** (recommended)
```bash
# Stage specific files
git add path/to/file1.js path/to/file2.js

# Or stage by directory
git add server/
git add client/src/
```

**⚠️ Important:** Never commit:
- `.env` files (contains secrets)
- `node_modules/` (should be in `.gitignore`)
- `client/build/` (build artifacts)
- Database files (`*.db`, `*.sqlite`)

### 4.4 Commit Changes

```bash
git commit -m "Description of your changes"
```

**Good commit message examples:**
```bash
git commit -m "Fix autosave functionality in WP1 form"
git commit -m "Add validation for project creation form"
git commit -m "Update PDF generation to include new fields"
```

### 4.5 Push to Remote Repository

```bash
# If this is your first push
git push -u origin main

# Or if branch is already set up
git push
```

**Note:** Replace `main` with your branch name if different (e.g., `master`, `develop`).

---

## Step 5: Deploy to Production

### 5.1 Pre-Deployment Checklist

Before deploying, run these validation scripts:

```bash
# Validate Supabase credentials format
npm run validate-credentials

# Run comprehensive pre-deployment checks
npm run pre-deploy-check
```

Fix any errors before proceeding.

### 5.2 Deploy Backend to Render.com

#### 5.2.1 Connect Repository to Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"Web Service"**
3. Connect your GitHub repository
4. Select your repository and branch

#### 5.2.2 Configure Service Settings

**Basic Settings:**
- **Name:** `mak-automation-backend` (or your preferred name)
- **Environment:** `Node`
- **Build Command:** `npm install`
- **Start Command:** `node server/index.js`
- **Plan:** Choose your plan (Free tier available)

#### 5.2.3 Add Environment Variables

In Render Dashboard → Your Service → **Environment** tab, add:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-production-jwt-secret
NODE_ENV=production
PORT=10000
```

**⚠️ CRITICAL:** 
- Use your **production** Supabase credentials
- Use a **strong, unique** JWT_SECRET (different from local)
- Render automatically sets PORT, but you can override it

#### 5.2.4 Deploy

1. Click **"Create Web Service"**
2. Render will build and deploy your backend
3. Wait for deployment to complete (check logs)
4. Your backend URL will be: `https://your-service-name.onrender.com`

#### 5.2.5 Verify Backend Deployment

```bash
# Update the script with your Render URL, then run:
npm run verify-render
```

Or manually test:
```bash
curl https://your-service-name.onrender.com/health
```

Should return: `{"ok":true}`

### 5.3 Deploy Frontend to Vercel

#### 5.3.1 Connect Repository to Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Select your repository

#### 5.3.2 Configure Project Settings

**Framework Preset:** 
- Select **"Other"** or **"Create React App"**

**Root Directory:**
- Set to `client` (since frontend is in client folder)

**Build Settings:**
- **Build Command:** `npm run build` (or `cd client && npm run build`)
- **Output Directory:** `build`
- **Install Command:** `npm install` (or `cd client && npm install`)

#### 5.3.3 Add Environment Variables

In Vercel Dashboard → Your Project → **Settings** → **Environment Variables**, add:

```env
REACT_APP_API_URL=https://your-service-name.onrender.com/api
```

**⚠️ Important:** Replace `your-service-name.onrender.com` with your actual Render backend URL.

#### 5.3.4 Deploy

1. Click **"Deploy"**
2. Vercel will build and deploy your frontend
3. Wait for deployment to complete
4. Your frontend URL will be: `https://your-project-name.vercel.app`

#### 5.3.5 Verify Frontend Deployment

1. Open your Vercel URL in a browser
2. Test login and basic functionality
3. Check browser console for errors

### 5.4 Post-Deployment Verification

#### ✅ Verify Backend
- [ ] Health check endpoint works: `https://your-backend.onrender.com/health`
- [ ] API endpoints respond correctly
- [ ] Database connection works (check Render logs)

#### ✅ Verify Frontend
- [ ] Frontend loads without errors
- [ ] Can login successfully
- [ ] API calls to backend work
- [ ] All features function correctly

#### ✅ Check Logs

**Render Logs:**
- Go to Render Dashboard → Your Service → **Logs** tab
- Should see: `✅ Supabase configuration found`
- Should see: `📊 Using Supabase database`
- Should NOT see errors

**Vercel Logs:**
- Go to Vercel Dashboard → Your Project → **Deployments** → Click deployment → **Logs**
- Check for build errors

---

## 🔄 Workflow Summary

### Daily Development Workflow

1. **Make changes locally**
2. **Test locally** (`npm run dev`)
3. **Verify everything works**
4. **Commit changes** (`git add .` → `git commit -m "..."`)
5. **Push to GitHub** (`git push`)
6. **Deploy** (Render and Vercel auto-deploy from GitHub, or manually trigger)

### Quick Commands Reference

```bash
# Local Development
npm run install-all          # Install all dependencies
npm run dev                  # Start dev server
npm run supabase:verify-connection  # Test database connection

# Testing
npm run validate-credentials # Validate Supabase config
npm run pre-deploy-check     # Pre-deployment validation

# Git
git status                   # Check changes
git add .                    # Stage all changes
git commit -m "message"      # Commit changes
git push                     # Push to remote

# Database
npm run supabase:execute-and-verify  # Run migrations
npm run supabase:verify              # Verify tables
```

---

## 🐛 Troubleshooting

### Backend won't start
- Check `.env` file exists and has correct values
- Verify Supabase credentials are correct
- Check port 5000 is not in use
- Run `npm run supabase:verify-connection`

### Frontend won't connect to backend
- Check `client/.env` has correct `REACT_APP_API_URL`
- Verify backend is running
- Check CORS settings in backend

### Database errors
- Run migrations: `npm run supabase:execute-and-verify`
- Verify connection: `npm run supabase:verify-connection`
- Check Supabase dashboard for errors

### Deployment fails
- Check build logs in Render/Vercel
- Verify environment variables are set correctly
- Ensure all dependencies are in `package.json`
- Check for syntax errors in code

---

## 📝 Notes

- **Never commit `.env` files** - they contain secrets
- **Always test locally** before deploying
- **Use Supabase for production** - SQLite is for local dev only
- **Keep JWT_SECRET secure** - use different values for dev and production
- **Monitor logs** after deployment to catch issues early

---

## 🎉 You're All Set!

You now have a complete workflow for:
1. ✅ Running locally
2. ✅ Testing changes
3. ✅ Committing to Git
4. ✅ Deploying to production

Happy coding! 🚀
