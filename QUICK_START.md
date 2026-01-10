# Quick Start Guide - MAK Automation

## 🚀 Starting the Application

After opening Cursor or restarting your computer, follow these steps to get the application running:

### Step 1: Navigate to Project Directory
```bash
cd C:\MakAutomation
```

### Step 2: Start the Development Servers
```bash
npm run dev
```

This command will:
- Start the backend server on port 5000
- Start the React frontend on port 3000
- Both servers will be accessible on your network at IP: `192.168.4.24`

### Step 3: Access the Application

**From your computer:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

**From other devices on your network:**
- Frontend: http://192.168.4.24:3000
- Backend API: http://192.168.4.24:5000

---

## 📝 Common Commands

### Development
```bash
npm run dev          # Start both server and client
npm run server       # Start only backend server
npm run client       # Start only React frontend
```

### Database Migrations
```bash
npm run migrate-db   # Run database migrations
```

### Reset Password
```bash
npm run reset-password
```

### Build for Production
```bash
npm run build        # Build React app for production
```

---

## 🔧 First Time Setup (if needed)

If this is your first time or after cloning:

1. **Install Dependencies:**
   ```bash
   npm run install-all
   ```

2. **Run Database Migrations:**
   ```bash
   npm run migrate-db
   ```

3. **Start the Application:**
   ```bash
   npm run dev
   ```

---

## 🌐 Network Configuration

The application is configured to use IP address: **192.168.4.24**

If your IP address changes:
1. Update `client/.env` file:
   ```
   REACT_APP_API_URL=http://YOUR_NEW_IP:5000/api
   ```
2. Update `client/src/api/api.ts` default URL
3. Update PDF generation URLs in:
   - `client/src/components/WP1Form.tsx`
   - `client/src/components/DensityReportForm.tsx`
   - `client/src/components/technician/TaskDetails.tsx`
4. Run: `node setup-network-env.js` to update .env file

---

## 🛑 Stopping the Application

Press `Ctrl + C` in the terminal to stop both servers.

---

## 📁 Project Structure

```
MakAutomation/
├── server/              # Backend (Express.js)
│   ├── routes/          # API routes
│   ├── templates/       # PDF templates
│   └── index.js         # Server entry point
├── client/              # Frontend (React + TypeScript)
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── api/         # API client code
│   │   └── ...
│   └── .env            # Environment variables
└── package.json        # Root package.json
```

---

## 🔐 Default Login Credentials

- **Admin:** admin@maklonestar.com / admin123
- **Technician:** (created by admin)

---

## ⚠️ Troubleshooting

### Port Already in Use
If you get "port already in use" error:
- Find and kill the process using the port
- Or change the port in `server/index.js` (PORT) and `client/.env` (if needed)

### Can't Access from Network
1. Check Windows Firewall settings
2. Verify IP address: `ipconfig` in command prompt
3. Ensure both servers are running
4. Check that `HOST=0.0.0.0` is set in `client/.env`

### Database Errors
Run migrations:
```bash
npm run migrate-db
```

---

## 📚 Additional Resources

- See `WORKFLOW_GUIDE.md` for detailed workflow documentation
- See `MIGRATION_NOTES.md` for database migration history
