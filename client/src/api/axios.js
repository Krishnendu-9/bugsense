import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('bugsense_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// A 401 from the login/register endpoints means "wrong credentials", not
// "session expired" — redirecting there reloads the page and destroys the
// error toast before the user can read it.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthAttempt = AUTH_ENDPOINTS.some((path) => url.includes(path));

    if (error.response?.status === 401 && !isAuthAttempt) {
      localStorage.removeItem('bugsense_token');
      localStorage.removeItem('bugsense_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
