# Next Steps: Run Application Locally

## ✅ Current Status
- ✅ Dependencies installed (root and client)
- ✅ .env file exists

## 🚀 Next Steps to Run Locally

### Step 1: Check Your .env Configuration

Open your `.env` file and check if you have Supabase credentials:

**Option A: Using Supabase (Recommended)**
Your `.env` should have:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
JWT_SECRET=your-secret-key
PORT=5000
NODE_ENV=development
```

**Option B: Using SQLite (Quick Start)**
If you don't have Supabase credentials, you can use SQLite:
```env
JWT_SECRET=your-secret-key
PORT=5000
NODE_ENV=development
```

---

### Step 2: Set Up Database

#### If Using Supabase:
```bash
# Run migrations to create tables
npm run supabase:execute-and-verify

# Verify connection
npm run supabase:verify-connection
```

**Expected output:**
```
✅ Supabase configuration found
✅ Database connection successful
✅ All tables verified
```

#### If Using SQLite:
No setup needed! SQLite will be created automatically on first run.

---

### Step 3: Start the Development Server

```bash
npm run dev
```

This will start:
- **Backend API** on `http://localhost:5000`
- **Frontend React App** on `http://localhost:3000`

**Expected output:**
```
✅ Supabase configuration found (or SQLite fallback message)
📊 Using Supabase database (or SQLite database)
Server running on http://localhost:5000
```

---

### Step 4: Open the Application

1. **Open your browser** and go to: `http://localhost:3000`
2. You should see the login page

---

### Step 5: Login

**Default Admin Credentials:**
- Email: `admin@maklonestar.com`
- Password: `admin123`

If the admin account doesn't exist, create it:
```bash
npm run create-admin
```

---

## 🔍 Troubleshooting

### Backend won't start?
- Check `.env` file has correct values
- Verify Supabase credentials (if using Supabase)
- Check port 5000 is not in use
- Run: `npm run supabase:verify-connection`

### Frontend won't connect?
- Check `client/.env` has `REACT_APP_API_URL=http://localhost:5000/api`
- Verify backend is running on port 5000
- Check browser console (F12) for errors

### Database errors?
- If Supabase: Run `npm run supabase:execute-and-verify`
- If SQLite: Check `server/mak_automation.db` exists

---

## 📋 Quick Command Reference

```bash
# Check Supabase connection
npm run supabase:verify-connection

# Run database migrations (Supabase)
npm run supabase:execute-and-verify

# Start development server
npm run dev

# Create admin user
npm run create-admin
```

---

## ✅ Success Checklist

When everything is working, you should see:
- [ ] Backend running on `http://localhost:5000`
- [ ] Frontend running on `http://localhost:3000`
- [ ] Can access login page
- [ ] Can login with admin credentials
- [ ] No errors in terminal/console

---

## 🎯 What to Do Next

1. **Test the application:**
   - Login as admin
   - Create a technician
   - Create a project
   - Assign work package
   - Test form filling

2. **Make changes:**
   - Edit code
   - Test changes
   - Verify everything works

3. **When ready to deploy:**
   - Commit changes: `git add .` → `git commit -m "message"` → `git push`
   - Deploy to production (Render/Vercel)

---

**You're ready to go!** 🚀

Run `npm run dev` to start the application.
