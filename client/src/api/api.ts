import axios from 'axios';

/**
 * API base URL resolution rules:
 * - Per-tenant override (tenant.apiBaseUrl) when set — for client's own backend so workflow path works
 * - Production (Vercel): use REACT_APP_API_BASE_URL
 * - Network/local: use REACT_APP_API_URL (set by setup-network-env.js)
 * - Local development: use http://localhost:5000
 */
const DEFAULT_API_URL =
  process.env.REACT_APP_API_BASE_URL ||
  process.env.REACT_APP_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:5000/api'
    : '');

/** Per-tenant backend URL; when set, all API requests go to this base (e.g. client's Windows backend). */
let tenantApiBaseUrlOverride: string | null = null;

export function getDefaultApiUrl(): string {
  return DEFAULT_API_URL;
}

export function setApiBaseUrl(url: string | null | undefined): void {
  tenantApiBaseUrlOverride = url && url.trim() ? url.trim() : null;
}

export function getApiBaseUrl(): string {
  return tenantApiBaseUrlOverride || DEFAULT_API_URL;
}

const api = axios.create({
  baseURL: DEFAULT_API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Use current base URL (default or tenant override) for every request
api.interceptors.request.use((config) => {
  config.baseURL = getApiBaseUrl();
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
      setApiBaseUrl(null);
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('tenant');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
