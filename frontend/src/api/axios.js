import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
});

// Wake the server as soon as the app opens (Render's free plan sleeps when idle),
// so it is already awake by the time you log in or open a page.
try {
  fetch(`${BASE_URL}/health`, { cache: 'no-store' }).catch(() => {});
} catch (e) {
  // ignore
}

// ---- Short-lived GET cache -------------------------------------------------
// Revisiting a page within 30 seconds shows instantly with no network wait.
// Identical requests made at the same moment share one request. Any change you
// make (add / edit / delete) clears the whole cache, so you never see stale data
// after your own actions.
const CACHE_TTL_MS = 30 * 1000;
const NO_CACHE_PREFIXES = ['/auth', '/audit', '/backup'];
const cache = new Map();
const inflight = new Map();
let cacheVersion = 0;

export function clearApiCache() {
  cacheVersion += 1;
  cache.clear();
  inflight.clear();
}

const clone = (data) => (typeof structuredClone === 'function' ? structuredClone(data) : JSON.parse(JSON.stringify(data)));

const cacheKey = (url, config) =>
  `${(localStorage.getItem('wt_token') || '').slice(-16)}|${url}|${JSON.stringify((config && config.params) || {})}`;

const rawGet = api.get.bind(api);
api.get = (url, config = {}) => {
  if (config.responseType || config.noCache || NO_CACHE_PREFIXES.some((p) => url.startsWith(p))) {
    return rawGet(url, config);
  }
  const key = cacheKey(url, config);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) {
    return Promise.resolve({ data: clone(hit.data), status: 200, statusText: 'OK', headers: {}, config, cached: true });
  }

  if (inflight.has(key)) {
    return inflight.get(key).then(({ res, snapshot }) => ({ ...res, data: clone(snapshot) }));
  }

  const startedAt = cacheVersion;
  const request = rawGet(url, config).then((res) => {
    const snapshot = clone(res.data);
    if (startedAt === cacheVersion) cache.set(key, { data: snapshot, time: Date.now() });
    return { res, snapshot };
  });
  inflight.set(key, request);
  request.finally(() => inflight.delete(key)).catch(() => {});
  return request.then(({ res }) => res);
};

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('wt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  if (config.method && config.method.toLowerCase() !== 'get') clearApiCache();
  return config;
});

const RETRY_DELAYS_MS = [3000, 6000]; // ~9s of waiting, plus the two 15s timeouts = ~24s max

api.interceptors.response.use(
  (res) => {
    if (res.config && res.config.method && res.config.method.toLowerCase() !== 'get') clearApiCache();
    return res;
  },
  async (err) => {
    const config = err.config;
    const isNetworkError = !err.response;

    if (isNetworkError && config && !config.noRetry) {
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
      clearApiCache();
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(err);
  }
);

export default api;