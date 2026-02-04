const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();

// ============================================================================
// STARTUP CONFIGURATION VALIDATION
// ============================================================================
const { validateConfiguration } = require('./db/supabase');

// Check if Supabase is required (default: optional, fallback to SQLite)
const REQUIRE_SUPABASE = process.env.REQUIRE_SUPABASE === 'true' || 
                         process.env.REQUIRE_SUPABASE === '1';

if (REQUIRE_SUPABASE) {
  console.log('🔍 Validating Supabase configuration (required)...\n');
  try {
    validateConfiguration(true); // Will throw if invalid
    console.log('✅ Supabase configuration validated successfully\n');
  } catch (error) {
    console.error(error.message);
    console.error('\n💡 To make Supabase optional, remove REQUIRE_SUPABASE from .env');
    console.error('   The application will fall back to SQLite if Supabase is not configured.\n');
    process.exit(1); // Fail fast
  }
} else {
  // Optional validation - just check and warn
  console.log('🔍 Checking Supabase configuration (optional)...\n');
  const validation = validateConfiguration(false);
  if (validation.isValid) {
    console.log('✅ Supabase configuration found\n');
  } else {
    console.log('ℹ️  Supabase not configured - will use SQLite fallback\n');
  }
}

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint (always available)
app.get('/health', (req, res) => {
  res.json({ ok: true });
});

// Root endpoint (always available)
app.get('/', (req, res) => {
  const clientBuildPath = path.join(__dirname, '../client/build');
  const clientIndexPath = path.join(clientBuildPath, 'index.html');
  const clientBuildExists = require('fs').existsSync(clientIndexPath);
  
  if (process.env.NODE_ENV === 'production' && clientBuildExists) {
    // If client build exists, serve it
    res.sendFile(clientIndexPath);
  } else {
    // Backend-only deployment (no client build)
    res.json({ ok: true, service: 'backend' });
  }
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/workpackages', require('./routes/workpackages'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api/wp1', require('./routes/wp1'));
app.use('/api/density', require('./routes/density'));
app.use('/api/rebar', require('./routes/rebar'));
app.use('/api/proctor', require('./routes/proctor'));
app.use('/api/pdf', require('./routes/pdf'));
app.use('/api/notifications', require('./routes/notifications').router);
app.use('/api/settings', require('./routes/settings'));

// Serve static files from React app in production (only if build exists)
// This catch-all must come AFTER API routes to ensure API routes work
const clientBuildPath = path.join(__dirname, '../client/build');
const clientIndexPath = path.join(clientBuildPath, 'index.html');
const clientBuildExists = require('fs').existsSync(clientIndexPath);

if (process.env.NODE_ENV === 'production' && clientBuildExists) {
  app.use(express.static(clientBuildPath));
  // Catch-all route for React app (only matches non-API routes)
  app.get('*', (req, res) => {
    // Skip if it's an API route (shouldn't happen, but safety check)
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API route not found' });
    }
    res.sendFile(clientIndexPath);
  });
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error: ' + err.message });
});

// Get local network IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  const virtualAdapterKeywords = ['hyper-v', 'wsl', 'virtual', 'vmware', 'virtualbox', 'vbox', 'veth', 'docker'];
  
  // First, try to find WiFi or Ethernet adapters (preferred)
  for (const name of Object.keys(interfaces)) {
    const isVirtual = virtualAdapterKeywords.some(keyword => 
      name.toLowerCase().includes(keyword)
    );
    
    if (isVirtual) continue; // Skip virtual adapters
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        const nameLower = name.toLowerCase();
        if (nameLower.includes('wi-fi') || nameLower.includes('wifi') || 
            nameLower.includes('ethernet') || nameLower.includes('lan') ||
            nameLower.includes('wireless')) {
          return iface.address;
        }
      }
    }
  }
  
  // If no WiFi/Ethernet found, try any non-virtual adapter
  for (const name of Object.keys(interfaces)) {
    const isVirtual = virtualAdapterKeywords.some(keyword => 
      name.toLowerCase().includes(keyword)
    );
    
    if (isVirtual) continue; // Skip virtual adapters
    
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return null;
}

const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces to allow network access
app.listen(PORT, HOST, () => {
  console.log(`Server running on http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  const localIP = getLocalIP();
  if (localIP) {
    console.log(`Server also accessible on network at http://${localIP}:${PORT}`);
  }
});

