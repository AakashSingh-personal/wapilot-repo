import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setAuthToken } from '../services/api.js';
import { startRealtime, stopRealtime } from '../realtime/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => sessionStorage.getItem('vartalap_token'));
  const [user, setUser] = useState(null);
  const [business, setBusiness] = useState(null);
  const [bootstrapping, setBootstrapping] = useState(() =>
    Boolean(sessionStorage.getItem('vartalap_token')),
  );
  // returnToken is kept in memory only (never written to storage) to limit XSS exposure.
  const [returnToken, setReturnToken] = useState(null);

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setBusiness(null);
    setReturnToken(null);
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
      } catch {
        setAuthToken(null);
        setToken(null);
        setUser(null);
        setBusiness(null);
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
      returnToken,
      setReturnToken,
    }),
    [token, user, business, bootstrapping, loginState, logout, returnToken],
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
