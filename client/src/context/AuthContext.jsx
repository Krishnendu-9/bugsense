import { createContext, useState, useEffect, useCallback } from 'react';
import api from '../api/axios.js';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem('bugsense_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  // Only "loading" while there is a token worth revalidating — otherwise the
  // answer is already known and an extra render is avoided.
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('bugsense_token')));

  useEffect(() => {
    if (!localStorage.getItem('bugsense_token')) return;

    api.get('/auth/me')
      .then((res) => setUser(res.data))
      .catch(() => {
        localStorage.removeItem('bugsense_token');
        localStorage.removeItem('bugsense_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('bugsense_token', data.token);
    localStorage.setItem('bugsense_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (name, email, password, role) => {
    const { data } = await api.post('/auth/register', { name, email, password, role });
    localStorage.setItem('bugsense_token', data.token);
    localStorage.setItem('bugsense_user', JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('bugsense_token');
    localStorage.removeItem('bugsense_user');
    setUser(null);
  }, []);

  const updateUser = useCallback((updatedUserData) => {
    setUser((prev) => {
      const next = { ...prev, ...updatedUserData };
      localStorage.setItem('bugsense_user', JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}
