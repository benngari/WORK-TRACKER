import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config;

    // Render's free tier spins down when idle, which can drop the very
    // first request with no response at all (not a normal error status).
    // Retry a couple of times with a short delay instead of failing outright.
    const isNetworkError = !err.response;
    if (isNetworkError && config && !config._retryCount) config._retryCount = 0;

    if (isNetworkError && config && config._retryCount < 2) {
      config._retryCount += 1;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      return api(config);
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