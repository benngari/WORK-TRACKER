import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const RETRY_DELAYS_MS = [3000, 6000]; // ~9s of waiting, plus the two 15s timeouts = ~24s max

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;
    const isNetworkError = !err.response;

    if (isNetworkError && config) {
      config._retryCount = config._retryCount || 0;
      if (config._retryCount < RETRY_DELAYS_MS.length) {
        const delay = RETRY_DELAYS_MS[config._retryCount];
        config._retryCount += 1;
        window.dispatchEvent(new CustomEvent('wt:server-waking', { detail: { attempt: config._retryCount } }));
        await new Promise((resolve) => setTimeout(resolve, delay));
        return api(config);
      }
    }

    if (err.response?.status === 401) {
      localStorage.removeItem('wt_token');
      localStorage.removeItem('wt_user');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;