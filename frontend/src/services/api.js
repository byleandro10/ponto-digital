import axios from 'axios';

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '');

export function buildApiUrl(path = '') {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${configuredApiBaseUrl}${normalizedPath}`;
}

const api = axios.create({ baseURL: configuredApiBaseUrl, timeout: 10000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isAuthRoute = requestUrl.includes('/auth/');

    if (error.response?.status === 401 && !isAuthRoute) {
      // Token expirado/inválido — só redireciona se NÃO for rota de login/registro
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    if (error.response?.status === 402) {
      // Assinatura expirada/inválida — redirecionar para renovação
      const currentPath = window.location.pathname;
      if (!currentPath.includes('/subscription') && !currentPath.includes('/checkout')) {
        window.location.href = '/admin/subscription';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
