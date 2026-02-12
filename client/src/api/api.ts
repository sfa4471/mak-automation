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

/**
 * Base URL for building full API paths in fetch() (e.g. PDF).
 * Same host as getApiBaseUrl() but without trailing /api to avoid double /api/api/.
 * Use for: `${getApiBaseUrlForFetch()}/api/pdf/...` or `${getApiBaseUrlForFetch()}/api/proctor/...`
 */
export function getApiBaseUrlForFetch(): string {
  const base = getApiBaseUrl();
  if (!base) return '';
  return base.replace(/\/api\/?$/, '');
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

// Handle 401 and 403 "Tenant context required" (stale token without tenantId after deploy)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error.response?.status;
    const message = (error.response?.data?.error || '').toLowerCase();
    const isTenantRequired = status === 403 && message.includes('tenant context required');

    if (status === 401 || isTenantRequired) {
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
