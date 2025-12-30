import { showError } from './utils';
import axios from 'axios';

export const API = axios.create({
  baseURL: process.env.REACT_APP_SERVER ? process.env.REACT_APP_SERVER : '',
});

API.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      let token = localStorage.getItem('wallet_token');
      try {
        const userStr = localStorage.getItem('user');
        if (!token && userStr) {
          const u = JSON.parse(userStr);
          token = u?.token;
        }
      } catch (e) {
        // ignore json parse error
      }
      if (token && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

API.interceptors.response.use(
  (response) => response,
  (error) => {
    showError(error);
  }
);
