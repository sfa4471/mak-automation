# Mobile Testing Guide

This guide explains how to test the application on a mobile device (phone/tablet) while the backend runs on your development machine.

## Quick Setup

1. **Run the setup script**:
   ```bash
   npm run setup-mobile
   ```
   
   This will:
   - Detect your machine's local IP address
   - Create `client/.env` with the correct API URL
   - Show you the IP address to use

2. **Start the server**:
   ```bash
   npm run dev
   ```

3. **Access from your phone**:
   - Make sure your phone is on the **same WiFi network** as your computer
   - Open browser on phone and go to: `http://YOUR_IP:3000`
   - Example: `http://192.168.1.100:3000`

## Manual Setup

If you prefer to set it up manually:

1. **Find your machine's IP address**:
   - **Windows**: Open Command Prompt and run `ipconfig`
     - Look for "IPv4 Address" under your active network adapter
   - **Mac/Linux**: Open Terminal and run `ifconfig` or `ip addr`
     - Look for "inet" address (not 127.0.0.1)

2. **Create `client/.env` file**:
   ```env
   REACT_APP_API_URL=http://YOUR_IP:5000/api
   ```
   
   Example:
   ```env
   REACT_APP_API_URL=http://192.168.1.100:5000/api
   ```

3. **Restart the React development server**:
   - Stop the server (Ctrl+C)
   - Run `npm run dev` again

## Switching Back to Localhost

To switch back to localhost development:

1. Edit `client/.env`:
   ```env
   REACT_APP_API_URL=http://localhost:5000/api
   ```

2. Or delete `client/.env` (it will default to localhost)

3. Restart the server

## Troubleshooting

### Phone can't connect

1. **Check WiFi**: Make sure phone and computer are on the same WiFi network
2. **Check firewall**: Your computer's firewall might be blocking port 5000
   - **Windows**: Allow Node.js through Windows Firewall
   - **Mac**: System Preferences → Security & Privacy → Firewall
3. **Check IP address**: Make sure you're using the correct IP (not 127.0.0.1 or localhost)

### API calls fail

1. **Verify .env file**: Check that `client/.env` exists and has the correct IP
2. **Check server is running**: Make sure `npm run dev` is running
3. **Check backend port**: Default is 5000, make sure nothing else is using it
4. **Restart server**: After changing .env, you must restart the React dev server

### CORS errors

If you see CORS errors, make sure:
- The backend is running
- The API URL in `.env` matches your actual IP
- You're accessing the frontend from the correct URL

## Network Requirements

- ✅ Phone and computer must be on the **same WiFi network**
- ✅ Computer's firewall must allow connections on port 5000
- ✅ Router must allow device-to-device communication (most home routers do)

## Security Note

⚠️ **Important**: This setup is for **local development only**. The backend will be accessible to any device on your local network. Do not use this in production without proper security measures.

