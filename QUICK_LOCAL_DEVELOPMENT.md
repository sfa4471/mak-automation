# Quick Local Development - Quick Reference

## 🚀 Quick Start (First Time)

```bash
# 1. Install dependencies
npm run install-all

# 2. Set up Supabase (or skip for SQLite)
# Create .env file with:
# SUPABASE_URL=https://your-project.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=your-key
# JWT_SECRET=your-secret

# 3. Run migrations (if using Supabase)
npm run supabase:execute-and-verify

# 4. Start development server
npm run dev
```

**Open:** http://localhost:3000  
**Login:** admin@maklonestar.com / admin123

---

## 🔄 Daily Workflow

```bash
# 1. Start dev server
npm run dev

# 2. Make changes and test

# 3. When ready to commit:
git status                    # Check what changed
git add .                     # Stage changes
git commit -m "Your message"  # Commit
git push                      # Push to GitHub
```

---

## ✅ Testing Checklist

- [ ] Login works
- [ ] Create technician
- [ ] Create project
- [ ] Assign work package
- [ ] Technician can fill form
- [ ] Autosave works
- [ ] PDF generation works
- [ ] No console errors

---

## 🚢 Deploy to Production

### Backend (Render.com)
1. Push to GitHub
2. Render auto-deploys (or manually trigger)
3. Add environment variables in Render dashboard
4. Verify: `https://your-backend.onrender.com/health`

### Frontend (Vercel)
1. Push to GitHub
2. Vercel auto-deploys (or manually trigger)
3. Add `REACT_APP_API_URL` environment variable
4. Verify: Open Vercel URL in browser

---

## 🐛 Common Issues

**Backend won't start:**
- Check `.env` file exists
- Verify Supabase credentials
- Run `npm run supabase:verify-connection`

**Frontend won't connect:**
- Check `client/.env` has `REACT_APP_API_URL`
- Verify backend is running on port 5000

**Database errors:**
- Run `npm run supabase:execute-and-verify`
- Check Supabase dashboard

---

## 📋 Important Files

- `.env` - Backend environment variables (DO NOT COMMIT)
- `client/.env` - Frontend environment variables (DO NOT COMMIT)
- `.gitignore` - Already configured to exclude secrets

---

## 🔗 Full Guide

See [LOCAL_DEVELOPMENT_AND_DEPLOYMENT_GUIDE.md](./LOCAL_DEVELOPMENT_AND_DEPLOYMENT_GUIDE.md) for detailed instructions.
