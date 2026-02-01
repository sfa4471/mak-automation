# Deploying MAK Automation to Vercel

This app has two parts:
- **Frontend** (React) – can be deployed to Vercel
- **Backend** (Node.js + Express + SQLite) – must be hosted elsewhere (Vercel does not support persistent SQLite)

## Recommended Setup: Frontend on Vercel + Backend on Railway/Render

### Step 1: Deploy the Backend (choose one)

#### Option A: Railway (recommended, free tier)
1. Go to [railway.app](https://railway.app)
2. Sign up and create a new project
3. Deploy from your GitHub repo:
   - Connect your repo
   - Set **Root Directory** to the project root (not `client`)
   - Set **Start Command**: `node server/index.js`
   - Add env var: `NODE_ENV=production`
4. Railway will give you a URL like `https://your-app.up.railway.app`
5. Your API will be at: `https://your-app.up.railway.app/api`

#### Option B: Render
1. Go to [render.com](https://render.com)
2. New → Web Service
3. Connect your repo
4. Build: `npm install`
5. Start: `node server/index.js`
6. Set **Root Directory** to project root

### Step 2: Deploy the Frontend to Vercel

1. Push your code to GitHub (if not already)

2. Go to [vercel.com](https://vercel.com) and sign in

3. **Import Project** → select your GitHub repo

4. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `.` (project root)
   - **Build Command**: `cd client && npm install && npm run build` (or leave default – vercel.json has it)
   - **Output Directory**: `client/build`

5. **Environment Variables** (required):
   - `REACT_APP_API_BASE_URL` = `https://YOUR-BACKEND-URL/api`
   
   Example: If Railway gave you `https://mak-automation.up.railway.app`, set:
   ```
   REACT_APP_API_BASE_URL=https://mak-automation.up.railway.app/api
   ```

6. Click **Deploy**

### Step 3: CORS on Backend

Make sure your backend allows requests from your Vercel frontend URL. In `server/index.js`, CORS is already enabled with `app.use(cors())`, which allows all origins. For production, you may want to restrict:

```javascript
app.use(cors({ origin: 'https://your-app.vercel.app' }));
```

---

## Quick Deploy Checklist

- [ ] Backend deployed (Railway or Render)
- [ ] Backend URL noted (e.g. `https://xxx.railway.app`)
- [ ] Vercel project created and linked to repo
- [ ] `REACT_APP_API_BASE_URL` set in Vercel to `https://YOUR-BACKEND/api`
- [ ] Deploy triggered

---

## Troubleshooting

**"Network Error" or API fails**
- Confirm `REACT_APP_API_BASE_URL` is set in Vercel (Project → Settings → Environment Variables)
- Confirm it ends with `/api` (e.g. `https://your-backend.railway.app/api`)
- Redeploy after changing env vars

**CORS errors**
- Update CORS origin in `server/index.js` to include your Vercel URL

**SQLite / file storage**
- SQLite stores data in a file. On Railway/Render, the filesystem is persistent for the server process. Backups are recommended.
