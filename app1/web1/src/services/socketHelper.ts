/**
 * Resolves the backend Socket.IO URL across local dev, staging, and production environments.
 * Ensures deployed frontends (e.g. Vercel) connect to the Render API backend WebSocket server
 * rather than trying to connect to the static CDN host or localhost.
 */
export function getBackendSocketUrl(): string {
  const envSocketUrl = (import.meta as any).env?.VITE_SOCKET_URL;
  if (envSocketUrl && typeof envSocketUrl === 'string' && envSocketUrl.trim().length > 0) {
    return envSocketUrl.trim();
  }

  const envApiUrl = (import.meta as any).env?.VITE_API_BASE_URL;
  if (envApiUrl && typeof envApiUrl === 'string' && envApiUrl.startsWith('http')) {
    return envApiUrl.replace(/\/api\/v1\/?$/, '').trim();
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:4000';
    }
  }

  // Deployed production default: Render backend API root
  return 'https://healthsetu-api-s35d.onrender.com';
}
