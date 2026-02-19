# Deployment Workflow Guide

This guide explains the complete process for testing changes locally, committing to Git, and deploying to Vercel (frontend) and Render (backend).

## Overview

- **Frontend (React)**: Deployed on Vercel
- **Backend (Node.js/Express)**: Deployed on Render
- **Database**: Supabase (PostgreSQL)
- **Version Control**: Git (GitHub)

---

## Complete Workflow: Local → Git → Deploy

### Step 1: Test Changes Locally

1. **Start the development server:**
   ```bash
   npm run dev
   ```
   This starts:
   - Backend on `http://localhost:5000`
   - Frontend on `http://localhost:3000`

2. **Test your changes:**
   - Open `http://localhost:3000` in your browser
   - Test all functionality thoroughly
   - Check browser console for errors
   - Verify API calls are working

3. **Stop the dev server** when done testing (Ctrl+C)

### Step 2: Commit Changes to Git

1. **Check what files have changed:**
   ```bash
   git status
   ```

2. **Review your changes:**
   ```bash
   git diff
   ```

3. **Stage your changes:**
   ```bash
   # Stage specific files
   git add <file1> <file2>
   
   # Or stage all changes
   git add .
   ```

4. **Commit with a descriptive message:**
   ```bash
   git commit -m "Description of your changes"
   ```
   
   Example:
   ```bash
   git commit -m "Fix WP1 form validation and improve error handling"
   ```

5. **Push to GitHub:**
   ```bash
   git push origin main
   ```
   (Replace `main` with your branch name if different)

### Step 3: Deploy to Vercel (Frontend)

Vercel automatically deploys when you push to GitHub if auto-deploy is enabled. Otherwise, deploy manually:

#### Option A: Automatic Deployment (Recommended)

1. **Push to GitHub** (already done in Step 2)
2. **Vercel automatically detects the push** and starts building
3. **Check deployment status:**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click on your project
   - View the "Deployments" tab
   - Wait for build to complete (usually 1-3 minutes)

#### Option B: Manual Deployment

1. **Go to Vercel Dashboard:**
   - Visit [vercel.com](https://vercel.com)
   - Sign in and select your project

2. **Trigger deployment:**
   - Click "Deployments" tab
   - Click "Redeploy" on the latest deployment
   - Or click "Deploy" → "Deploy Latest Commit"

3. **Monitor the build:**
   - Watch the build logs for errors
   - Wait for "Ready" status

#### Verify Vercel Deployment

1. **Check the deployment URL:**
   - Usually: `https://your-project.vercel.app`
   - Found in Vercel Dashboard → Deployments → Visit

2. **Test the deployed frontend:**
   - Open the URL in your browser
   - Verify it connects to your Render backend
   - Test key functionality

### Step 4: Deploy to Render (Backend)

Render automatically deploys when you push to GitHub if auto-deploy is enabled. Otherwise, deploy manually:

#### Option A: Automatic Deployment (Recommended)

1. **Push to GitHub** (already done in Step 2)
2. **Render automatically detects the push** and starts building
3. **Check deployment status:**
   - Go to [Render Dashboard](https://dashboard.render.com)
   - Click on your web service
   - View the "Events" or "Logs" tab
   - Wait for deployment to complete (usually 2-5 minutes)

#### Option B: Manual Deployment

1. **Go to Render Dashboard:**
   - Visit [dashboard.render.com](https://dashboard.render.com)
   - Sign in and select your web service

2. **Trigger deployment:**
   - Click "Manual Deploy" → "Deploy latest commit"
   - Or go to "Events" tab → "Deploy"

3. **Monitor the deployment:**
   - Watch the logs for errors
   - Look for: `Server listening on port...`
   - Wait for "Live" status

#### Verify Render Deployment

1. **Check the service URL:**
   - Usually: `https://your-service.onrender.com`
   - Found in Render Dashboard → Your Service → URL

2. **Test the API:**
   ```bash
   # Test health endpoint (if available)
   curl https://your-service.onrender.com/api/health
   
   # Or test in browser
   https://your-service.onrender.com/api/projects
   ```

3. **Check logs:**
   - Render Dashboard → Your Service → Logs
   - Should see: `✅ Supabase configuration found`
   - Should NOT see errors

---

## Environment Variables

### Local Development

**Root `.env` file:**
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
NODE_ENV=development
```

**Client `.env` file (optional, for local dev):**
```env
REACT_APP_API_URL=http://localhost:5000/api
```

### Vercel (Frontend)

**Required environment variable:**
- `REACT_APP_API_BASE_URL` = `https://your-backend.onrender.com/api`

**To update:**
1. Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add or edit `REACT_APP_API_BASE_URL`
3. **Redeploy** after changing environment variables

### Render (Backend)

**Required environment variables:**
- `SUPABASE_URL` = `https://your-project.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` = `your-service-role-key`
- `NODE_ENV` = `production`

**To update:**
1. Render Dashboard → Your Service → Environment
2. Add or edit variables
3. **Redeploy** after changing environment variables

---

## Best Practices

### 1. Always Test Locally First
- Never push untested code
- Test all affected features
- Check for console errors

### 2. Use Descriptive Commit Messages
```bash
# Good
git commit -m "Fix WP1 form date validation issue"
git commit -m "Add error handling for PDF generation"
git commit -m "Update project counter logic"

# Bad
git commit -m "fix"
git commit -m "changes"
```

### 3. Deploy in Order
1. **Backend first** (Render) - Deploy API changes
2. **Frontend second** (Vercel) - Deploy UI changes that depend on API

### 4. Verify After Deployment
- Always test the deployed version
- Check both frontend and backend
- Verify database connections

### 5. Monitor Logs
- **Vercel**: Dashboard → Deployments → Build Logs
- **Render**: Dashboard → Your Service → Logs

### 6. Use Branches for Major Changes
```bash
# Create a feature branch
git checkout -b feature/new-feature

# Make changes, test, commit
git add .
git commit -m "Add new feature"

# Push branch
git push origin feature/new-feature

# Merge to main when ready
git checkout main
git merge feature/new-feature
git push origin main
```

---

## Troubleshooting

### Vercel Build Fails

1. **Check build logs:**
   - Vercel Dashboard → Deployments → Failed deployment → View Logs

2. **Common issues:**
   - Missing dependencies: Run `npm install` in `client/` directory
   - TypeScript errors: Fix errors locally first
   - Environment variables: Ensure `REACT_APP_API_BASE_URL` is set

3. **Fix and redeploy:**
   - Fix issues locally
   - Commit and push
   - Or manually redeploy

### Render Deployment Fails

1. **Check deployment logs:**
   - Render Dashboard → Your Service → Logs

2. **Common issues:**
   - Missing environment variables: Check `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
   - Database connection errors: Verify Supabase credentials
   - Port issues: Ensure server listens on `process.env.PORT` (Render sets this automatically)

3. **Fix and redeploy:**
   - Fix issues locally
   - Commit and push
   - Or manually redeploy

### Frontend Can't Connect to Backend

1. **Check environment variable:**
   - Vercel Dashboard → Settings → Environment Variables
   - Verify `REACT_APP_API_BASE_URL` is correct
   - Should be: `https://your-backend.onrender.com/api`

2. **Check CORS:**
   - Render backend should allow requests from Vercel domain
   - Check `server/index.js` CORS configuration

3. **Redeploy both:**
   - After fixing, redeploy both frontend and backend

### Database Connection Issues

1. **Verify Supabase credentials:**
   ```bash
   npm run supabase:verify-connection
   ```

2. **Check Render environment variables:**
   - Render Dashboard → Your Service → Environment
   - Verify `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`

3. **Check Supabase dashboard:**
   - Ensure project is active
   - Check API settings

---

## Quick Reference Commands

```bash
# Local Development
npm run dev                    # Start dev server
npm run build                  # Build frontend for production

# Git Workflow
git status                     # Check changed files
git add .                      # Stage all changes
git commit -m "message"        # Commit changes
git push origin main           # Push to GitHub

# Database
npm run supabase:verify-connection    # Test Supabase connection
npm run supabase:execute-and-verify   # Run migrations

# Deployment Verification
npm run verify-render          # Verify Render deployment
npm run pre-deploy-check       # Pre-deployment validation
```

---

## Deployment Checklist

Before deploying, ensure:

- [ ] All changes tested locally
- [ ] No console errors
- [ ] Git changes committed and pushed
- [ ] Environment variables set correctly (Vercel & Render)
- [ ] Database migrations up to date
- [ ] Backend deployed and verified (Render)
- [ ] Frontend deployed and verified (Vercel)
- [ ] End-to-end testing on deployed version
- [ ] Logs checked for errors

---

## Summary: Typical Workflow

```bash
# 1. Make changes to code

# 2. Test locally
npm run dev

# 3. Commit and push
git add .
git commit -m "Your change description"
git push origin main

# 4. Wait for auto-deploy (or deploy manually)
# - Vercel: Check dashboard for deployment status
# - Render: Check dashboard for deployment status

# 5. Verify deployment
# - Test frontend URL
# - Test backend API
# - Check logs for errors
```

That's it! Your changes are now live. 🚀
