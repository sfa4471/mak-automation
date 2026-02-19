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
 * Base URL of the backend currently used for API calls (no trailing /api).
 * Use this for building PDF download or logo URLs so they hit the same backend as the API.
 */
export function getCurrentApiBaseUrl(): string {
  const b = api.defaults.baseURL || '';
  return b.replace(/\/api\/?$/, '') || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : '');
}

/**
 * API path prefix for building PDF/asset URLs (base + '/api').
 * Use with paths like getApiPathPrefix() + '/pdf/density/123' so the request hits the same backend as the API.
 */
export function getApiPathPrefix(): string {
  const base = getCurrentApiBaseUrl();
  return base ? `${base}/api` : '/api';
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
