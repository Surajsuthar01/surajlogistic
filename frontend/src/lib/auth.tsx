import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { OrgRec, UserRec } from '@suraj/shared';
import { api, getToken, setToken } from './api';

interface AuthState {
  user: UserRec | null;
  org: OrgRec | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<UserRec>;
  register: (b: { orgName: string; name: string; email: string; password: string; phone?: string; gstin?: string }) => Promise<UserRec>;
  logout: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserRec | null>(null);
  const [org, setOrg] = useState<OrgRec | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    try {
      const r = await api.get<{ user: UserRec; org: OrgRec }>('/api/me');
      setUser(r.user);
      setOrg(r.org);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const out = () => {
      setUser(null);
      setOrg(null);
    };
    window.addEventListener('sl:logout', out);
    return () => window.removeEventListener('sl:logout', out);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await api.post<{ token: string; user: UserRec; org: OrgRec }>('/api/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    setOrg(r.org);
    return r.user;
  };

  const register: AuthState['register'] = async (b) => {
    const r = await api.post<{ token: string; user: UserRec; org: OrgRec }>('/api/auth/register', b);
    setToken(r.token);
    setUser(r.user);
    setOrg(r.org);
    return r.user;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setOrg(null);
  };

  return <Ctx.Provider value={{ user, org, loading, login, register, logout, refresh }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth outside AuthProvider');
  return c;
}
