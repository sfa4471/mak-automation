import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, authAPI } from '../api/auth';
import { setApiBaseUrl } from '../api/api';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAdmin: () => boolean;
  isTechnician: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    
    if (token && storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        // Verify token is still valid
        authAPI.getMe()
          .then((currentUser) => {
            setUser(currentUser);
            setApiBaseUrl(currentUser.apiBaseUrl ?? null);
            localStorage.setItem('user', JSON.stringify(currentUser));
            if (currentUser.tenantId && currentUser.tenantName) {
              localStorage.setItem('tenant', JSON.stringify({
                tenantId: currentUser.tenantId,
                tenantName: currentUser.tenantName,
                tenantSubdomain: currentUser.tenantSubdomain ?? null,
              }));
            }
          })
          .catch(() => {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
          })
          .finally(() => setLoading(false));
      } catch (e) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    const response = await authAPI.login(email, password);
    const apiBaseUrl = response.tenant?.apiBaseUrl ?? response.user.apiBaseUrl ?? null;
    setApiBaseUrl(apiBaseUrl ?? null);
    const userWithTenant = {
      ...response.user,
      tenantId: response.tenant?.tenantId ?? response.user.tenantId,
      tenantName: response.tenant?.tenantName ?? response.user.tenantName,
      tenantSubdomain: response.tenant?.tenantSubdomain ?? response.user.tenantSubdomain ?? null,
      apiBaseUrl: apiBaseUrl ?? undefined,
    };
    localStorage.setItem('token', response.token);
    localStorage.setItem('user', JSON.stringify(userWithTenant));
    if (response.tenant) {
      localStorage.setItem('tenant', JSON.stringify({ ...response.tenant, apiBaseUrl: apiBaseUrl ?? undefined }));
    }
    setUser(userWithTenant);
  };

  const logout = () => {
    setApiBaseUrl(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('tenant');
    setUser(null);
  };

  const isAdmin = () => user?.role === 'ADMIN';
  const isTechnician = () => user?.role === 'TECHNICIAN';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin, isTechnician }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

