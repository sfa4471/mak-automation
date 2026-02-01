# Vercel Deployment Configuration Fix

## Issue
Vercel build is failing with: `Command "cd client && npm install" exited with 1`

## Solution

You need to configure the **Root Directory** in your Vercel project settings:

### Steps:
1. Go to your Vercel project: https://vercel.com/fawad-akhtars-projects-8c09bd58/mak-automation
2. Click on **Settings** → **General**
3. Scroll down to **Root Directory**
4. Set it to: `client`
5. Save the changes
6. Redeploy the project

### Alternative: Use vercel.json in client directory

I've created `client/vercel.json` which will be used if Vercel detects it. However, the Root Directory setting is the most reliable solution.

### Current Configuration

- **Root vercel.json**: Configured for monorepo structure
- **client/vercel.json**: Configured for client-only deployment

Both files are now in the repository. The Root Directory setting in Vercel dashboard will determine which one is used.
