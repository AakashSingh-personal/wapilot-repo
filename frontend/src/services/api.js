import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL ?? '';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('wapilot_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export function setAuthToken(token) {
  if (token) sessionStorage.setItem('wapilot_token', token);
  else sessionStorage.removeItem('wapilot_token');
}
