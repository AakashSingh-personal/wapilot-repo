import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../services/api.js';
import { startRealtime, stopRealtime } from '../realtime/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem('wapilot_token'));
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(() =>
    Boolean(localStorage.getItem('wapilot_token')),
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setBusiness(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setBootstrapping(false);
      return;
    }
    setAuthToken(token);
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/me');
        if (cancelled) return;
        setUser(data.user);
        setBusiness(data.business);
        localStorage.setItem('wapilot_user', JSON.stringify(data.user));
        if (data.business) localStorage.setItem('wapilot_business', JSON.stringify(data.business));
      } catch {
        setAuthToken(null);
        setToken(null);
        setUser(null);
        setBusiness(null);
        localStorage.removeItem('wapilot_user');
        localStorage.removeItem('wapilot_business');
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const authed = Boolean(token && user);
    if (!authed || !token) {
      stopRealtime();
      return;
    }
    startRealtime({
      getToken: () => token,
    });
    return () => {
      stopRealtime();
    };
  }, [token, user]);

  const loginState = useCallback(({ token: t, user: u, business: b }) => {
    setAuthToken(t);
    setToken(t);
    setUser(u);
    setBusiness(b);
    localStorage.setItem('wapilot_user', JSON.stringify(u));
    if (b) localStorage.setItem('wapilot_business', JSON.stringify(b));
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      business,
      bootstrapping,
      isAuthenticated: Boolean(token && user),
      loginState,
      logout,
    }),
    [token, user, business, bootstrapping, loginState, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function loginRequest(payload) {
  const { data } = await api.post('/auth/login', payload);
  return data;
}

export async function registerRequest(payload) {
  const { data } = await api.post('/auth/register', payload);
  return data;
}
