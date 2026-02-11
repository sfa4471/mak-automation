import api from './api';

export interface Tenant {
  tenantId: number;
  name: string;
  subdomain?: string | null;
  /** When set, frontend uses this URL for API (client's backend so workflow path works) */
  apiBaseUrl?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  logoPath?: string | null;
  primaryColor?: string;
  secondaryColor?: string;
  projectNumberPrefix?: string;
  projectNumberFormat?: string;
}

export const tenantsAPI = {
  /** GET /api/tenants/me — current tenant for logged-in user */
  getMe: async (): Promise<Tenant> => {
    const { data } = await api.get<Tenant>('/tenants/me');
    return data;
  },

  /** PUT /api/tenants/me — update current tenant (admin only) */
  updateMe: async (payload: Partial<Pick<Tenant, 'name' | 'companyAddress' | 'companyCity' | 'companyState' | 'companyZip' | 'companyPhone' | 'companyEmail' | 'companyWebsite'>>): Promise<Tenant> => {
    const { data } = await api.put<Tenant>('/tenants/me', payload);
    return data;
  },

  /** POST /api/tenants/logo — upload logo (admin only); server may return 501 stub */
  uploadLogo: async (file: File): Promise<{ logoPath: string }> => {
    const formData = new FormData();
    formData.append('logo', file);
    const { data } = await api.post<{ logoPath: string }>('/tenants/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },
};
