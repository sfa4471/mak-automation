const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
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

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/build')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/build', 'index.html'));
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

