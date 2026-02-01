/**
 * Supabase Client Module
 * 
 * This module provides a configured Supabase client for server-side operations.
 * Uses the service role key to bypass Row Level Security (RLS) for admin operations.
 * 
 * Usage:
 *   const supabase = require('./db/supabase');
 *   const { data, error } = await supabase.from('users').select('*');
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Validate Supabase configuration
 * @param {boolean} required - If true, throws error if not configured. If false, returns validation result.
 * @returns {object} Validation result with isValid, missing, and messages
 * @throws {Error} If required is true and configuration is invalid
 */
function validateConfiguration(required = false) {
  const missing = [];
  const messages = [];

  if (!supabaseUrl) {
    missing.push('SUPABASE_URL');
    messages.push('  ❌ SUPABASE_URL is not set');
  } else if (!supabaseUrl.match(/^https?:\/\/[^.]+\.supabase\.co/)) {
    missing.push('SUPABASE_URL (invalid format)');
    messages.push(`  ❌ SUPABASE_URL has invalid format: ${supabaseUrl}`);
    messages.push('     Expected format: https://[project-ref].supabase.co');
  }

  if (!supabaseServiceKey) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
    messages.push('  ❌ SUPABASE_SERVICE_ROLE_KEY is not set');
  } else if (supabaseServiceKey.length < 20) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY (too short)');
    messages.push('  ❌ SUPABASE_SERVICE_ROLE_KEY appears to be invalid (too short)');
  }

  const isValid = missing.length === 0;

  if (required && !isValid) {
    console.error('\n' + '='.repeat(70));
    console.error('❌ SUPABASE CONFIGURATION ERROR');
    console.error('='.repeat(70));
    console.error('\nSupabase is required but configuration is invalid:\n');
    messages.forEach(msg => console.error(msg));
    console.error('\n📋 How to fix:');
    console.error('  1. Go to: https://supabase.com/dashboard');
    console.error('  2. Select your project');
    console.error('  3. Go to: Settings → API');
    console.error('  4. Copy the following values:');
    console.error('     - Project URL → SUPABASE_URL');
    console.error('     - service_role key → SUPABASE_SERVICE_ROLE_KEY');
    console.error('  5. Add them to your .env file:');
    console.error('     SUPABASE_URL=https://[project-ref].supabase.co');
    console.error('     SUPABASE_SERVICE_ROLE_KEY=your-service-role-key');
    console.error('\n' + '='.repeat(70) + '\n');
    throw new Error(`Supabase configuration invalid: Missing ${missing.join(', ')}`);
  }

  if (!required && !isValid) {
    console.warn('⚠️  Supabase environment variables not set.');
    console.warn('   Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    console.warn('   Application will fall back to SQLite if available.\n');
  }

  return { isValid, missing, messages };
}

// Validate configuration (non-blocking, will warn if optional)
validateConfiguration(false);

// Create Supabase client with service role key (bypasses RLS)
const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : null;

/**
 * Helper function to convert camelCase to snake_case for column names
 */
function toSnakeCase(str) {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

/**
 * Helper function to convert snake_case to camelCase for column names
 */
function toCamelCase(str) {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * Convert object keys from camelCase to snake_case
 */
function keysToSnakeCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(keysToSnakeCase);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = keysToSnakeCase(value);
  }
  return result;
}

/**
 * Convert object keys from snake_case to camelCase
 */
function keysToCamelCase(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(keysToCamelCase);
  
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = toCamelCase(key);
    result[camelKey] = keysToCamelCase(value);
  }
  return result;
}

/**
 * Check if Supabase is configured and available
 */
function isAvailable() {
  return supabase !== null;
}

module.exports = {
  supabase,
  isAvailable,
  validateConfiguration,
  toSnakeCase,
  toCamelCase,
  keysToSnakeCase,
  keysToCamelCase
};
