import axios from 'axios';

/**
 * API base URL resolution rules:
 * - Production (Vercel): use REACT_APP_API_BASE_URL
 * - Network/local: use REACT_APP_API_URL (set by setup-network-env.js)
 * - Local development: use http://localhost:5000
 * - NO hardcoded LAN IPs
 * - When tenant has apiBaseUrl (client's own backend), that overrides after login.
 */
const API_URL =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : '');

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Switch API base URL to the tenant's backend (e.g. client's PC).
 * Call with tenant.apiBaseUrl after login when present; call with null on logout to reset.
 */
export function setApiBaseUrl(url: string | null): void {
  if (url && url.trim()) {
    const base = url.trim().replace(/\/api\/?$/, '');
    api.defaults.baseURL = `${base}/api`;
  } else {
    api.defaults.baseURL = API_URL;
  }
}

/**
 * Strip trailing /api or /api/ from a URL so we never double up path segments.
 */
function stripApiSuffix(url: string): string {
  return (url || '').replace(/\/api\/?$/, '').replace(/\/+$/, '') || '';
}

/**
 * Return the origin (protocol + host) of the current API base URL.
 * Used to build PDF/asset URLs with exactly one /api segment (avoids /api/api/ 404).
 */
function getApiOrigin(): string {
  const b = api.defaults.baseURL || '';
  const normalized = stripApiSuffix(b) || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');
  if (!normalized) return '';
  try {
    const u = new URL(normalized.startsWith('http') ? normalized : `${window.location.origin}${normalized}`);
    return u.origin;
  } catch {
    return normalized;
  }
}

/**
 * Base URL of the backend currently used for API calls (no trailing /api).
 * Use this for building PDF download or logo URLs so they hit the same backend as the API.
 */
export function getCurrentApiBaseUrl(): string {
  const b = api.defaults.baseURL || '';
  return stripApiSuffix(b) || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');
}

/**
 * API path prefix for building PDF/asset URLs: always exactly origin + '/api'.
 * Use with paths like getApiPathPrefix() + '/pdf/wp1/123'. Building from origin
 * guarantees a single /api segment and avoids /api/api/... (404) when env or tenant URL includes /api.
 */
export function getApiPathPrefix(): string {
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : '/api';
}

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
