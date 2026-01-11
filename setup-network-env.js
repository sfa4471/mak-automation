const os = require('os');
const fs = require('fs');
const path = require('path');

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
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        // Prefer WiFi and Ethernet adapters
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
  
  return '192.168.4.30'; // Fallback to current IP
}

const ip = getLocalIP();
const clientEnvPath = path.join(__dirname, 'client', '.env');
const envContent = `HOST=0.0.0.0
REACT_APP_API_URL=http://${ip}:5000/api
`;

console.log('🔧 Setting up network configuration...\n');
console.log(`📱 Detected local IP address: ${ip}`);
console.log(`📝 Creating/updating .env file at: ${clientEnvPath}\n`);

try {
  fs.writeFileSync(clientEnvPath, envContent, 'utf8');
  console.log('✅ Updated client/.env file with network configuration');
  console.log(`   HOST=0.0.0.0`);
  console.log(`   REACT_APP_API_URL=http://${ip}:5000/api`);
  console.log(`\n💡 If the detected IP is incorrect, you can:`);
  console.log(`   1. Manually edit client/.env and set REACT_APP_API_URL`);
  console.log(`   2. Or update the IP in client/src/api/api.ts and other components`);
} catch (err) {
  console.error('❌ Error creating .env file:', err.message);
  console.log('\nPlease manually create client/.env with:');
  console.log('HOST=0.0.0.0');
  console.log(`REACT_APP_API_URL=http://${ip}:5000/api`);
}

