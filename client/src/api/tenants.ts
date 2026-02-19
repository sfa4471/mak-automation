/**
 * Tenant (company info) API client
 * GET/PUT /api/tenants/me, POST /api/tenants/logo
 */

import api from './api';

export interface TenantMe {
  id: number;
  name: string | null;
  companyAddress: string | null;
  companyCity: string | null;
  companyState: string | null;
  companyZip: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyWebsite: string | null;
  companyContactName: string | null;
  peFirmReg: string | null;
  licenseHolderName: string | null;
  licenseHolderTitle: string | null;
  logoPath: string | null;
}

export interface TenantMeUpdate {
  name?: string | null;
  companyAddress?: string | null;
  companyCity?: string | null;
  companyState?: string | null;
  companyZip?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  companyContactName?: string | null;
  peFirmReg?: string | null;
  licenseHolderName?: string | null;
  licenseHolderTitle?: string | null;
}

export const tenantsAPI = {
  getMe: async (): Promise<TenantMe> => {
    const response = await api.get<TenantMe>('/tenants/me');
    return response.data;
  },

  putMe: async (data: TenantMeUpdate): Promise<TenantMe> => {
    const response = await api.put<TenantMe>('/tenants/me', data);
    return response.data;
  },

  uploadLogo: async (file: File): Promise<{ success: boolean; logoPath?: string; url?: string }> => {
    const formData = new FormData();
    formData.append('logo', file);
    const response = await api.post<{ success: boolean; logoPath?: string; url?: string }>(
      '/tenants/logo',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },
};
