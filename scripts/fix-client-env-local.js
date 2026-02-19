/**
 * Fix Client .env for Local Development
 * 
 * This script updates the client/.env file to use localhost for local development.
 * 
 * Usage:
 *   node scripts/fix-client-env-local.js
 */

const fs = require('fs');
const path = require('path');

const clientEnvPath = path.join(__dirname, '..', 'client', '.env');

try {
  let content = '';
  
  if (fs.existsSync(clientEnvPath)) {
    content = fs.readFileSync(clientEnvPath, 'utf8');
  }
  
  // Update or add REACT_APP_API_URL
  if (content.includes('REACT_APP_API_URL')) {
    // Replace existing REACT_APP_API_URL
    content = content.replace(
      /REACT_APP_API_URL=.*/g,
      'REACT_APP_API_URL=http://localhost:5000/api'
    );
  } else {
    // Add REACT_APP_API_URL if it doesn't exist
    if (content && !content.endsWith('\n')) {
      content += '\n';
    }
    content += 'REACT_APP_API_URL=http://localhost:5000/api\n';
  }
  
  // Ensure HOST is set
  if (!content.includes('HOST=')) {
    content = 'HOST=0.0.0.0\n' + content;
  }
  
  fs.writeFileSync(clientEnvPath, content, 'utf8');
  
  console.log('✅ Updated client/.env for local development');
  console.log('   REACT_APP_API_URL=http://localhost:5000/api');
  console.log('\n💡 Restart your dev server (npm run dev) for changes to take effect.\n');
} catch (error) {
  console.error('❌ Error updating client/.env:');
  console.error(error.message);
  process.exit(1);
}
