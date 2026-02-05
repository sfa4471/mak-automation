/**
 * API URL Utility
 * 
 * Centralized function to get the API base URL consistently across the application.
 * This ensures we don't have hardcoded IP addresses and handles all environments properly.
 * 
 * Usage:
 *   import { getApiBaseUrl } from '../utils/apiUrl';
 *   const baseUrl = getApiBaseUrl();
 *   const pdfUrl = `${baseUrl}/api/pdf/...`;
 */

/**
 * Get the API base URL (without /api suffix)
 * 
 * Resolution rules:
 * - Production (Vercel): use REACT_APP_API_BASE_URL
 * - Network/local: use REACT_APP_API_URL (set by setup-network-env.js)
 * - Local development: use http://localhost:5000
 * - Fallback: empty string (relative URLs)
 */
export function getApiBaseUrl(): string {
  // Check for production base URL first
  if (process.env.REACT_APP_API_BASE_URL) {
    return process.env.REACT_APP_API_BASE_URL.replace(/\/api\/?$/, '');
  }
  
  // Check for network/local API URL
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL.replace(/\/api\/?$/, '');
  }
  
  // Local development fallback
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:5000';
  }
  
  // Production fallback - use relative URLs
  return '';
}

/**
 * Get the full API URL (with /api suffix)
 * 
 * This is for direct fetch() calls that need the full API path
 */
export function getApiUrl(): string {
  const baseUrl = getApiBaseUrl();
  return baseUrl ? `${baseUrl}/api` : '/api';
}
