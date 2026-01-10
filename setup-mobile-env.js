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
            nameLower.includes('ethernet') || nameLower.includes('lan')) {
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
  
  return 'localhost';
}

const ip = getLocalIP();
const envPath = path.join(__dirname, 'client', '.env');
const envContent = `# API Base URL - Auto-generated for mobile testing
# Generated IP: ${ip}
# To use localhost instead, change to: http://localhost:5000/api
REACT_APP_API_URL=http://${ip}:5000/api
`;

console.log('🔧 Setting up mobile testing environment...\n');
console.log(`📱 Detected local IP address: ${ip}`);
console.log(`📝 Creating .env file at: ${envPath}\n`);

try {
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created successfully!');
  console.log(`\n📋 Configuration:`);
  console.log(`   API URL: http://${ip}:5000/api`);
  console.log(`\n📱 To test on mobile:`);
  console.log(`   1. Make sure your phone is on the same WiFi network`);
  console.log(`   2. Start the server: npm run dev`);
  console.log(`   3. Access from phone: http://${ip}:3000`);
  console.log(`\n💡 To switch back to localhost, edit client/.env and change to:`);
  console.log(`   REACT_APP_API_URL=http://localhost:5000/api\n`);
} catch (error) {
  console.error('❌ Error creating .env file:', error.message);
  process.exit(1);
}

