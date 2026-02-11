import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { tenantsAPI, Tenant } from '../api/tenants';
import { setApiBaseUrl } from '../api/api';

interface TenantContextType {
  tenant: Tenant | null;
  loading: boolean;
  refreshTenant: () => Promise<void>;
}

const TenantContext = createContext<TenantContextType | undefined>(undefined);

export const TenantProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTenant = useCallback(async () => {
    if (!user?.tenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const data = await tenantsAPI.getMe();
      setTenant(data);
      if (data.apiBaseUrl != null) setApiBaseUrl(data.apiBaseUrl);
    } catch (err) {
      console.error('Failed to load tenant:', err);
      setTenant(null);
    } finally {
      setLoading(false);
    }
  }, [user?.tenantId]);

  useEffect(() => {
    if (!user?.tenantId) {
      setTenant(null);
      setLoading(false);
      return;
    }
    refreshTenant();
  }, [user?.tenantId, refreshTenant]);

  return (
    <TenantContext.Provider value={{ tenant, loading, refreshTenant }}>
      {children}
    </TenantContext.Provider>
  );
};

export const useTenant = (): TenantContextType => {
  const context = useContext(TenantContext);
  if (context === undefined) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return context;
};
