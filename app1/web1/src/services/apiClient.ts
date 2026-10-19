import { useAuthStore } from '../features/auth/useAuthStore.js';

export const API_BASE_URL = import.meta.env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const apiClient = async <T>(
  path: string,
  options: RequestInit = {},
): Promise<T> => {
  const normalizedPath = path.startsWith('/api/v1') ? path.replace(/^\/api\/v1/, '') : path;
  const url = normalizedPath.startsWith('http')
    ? normalizedPath
    : `${API_BASE_URL}${normalizedPath.startsWith('/') ? normalizedPath : `/${normalizedPath}`}`;
  const token = useAuthStore.getState().accessToken;

  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Ensures httpOnly refreshToken cookie is included
  });

  const isAuthEndpoint = path.startsWith('/auth/') && path !== '/auth/me';

  // Handle 401: Token expired on protected API routes, try exactly one silent refresh
  if (response.status === 401 && !isAuthEndpoint) {
    const refreshed = await useAuthStore.getState().refreshSession();
    if (refreshed) {
      const retryToken = useAuthStore.getState().accessToken;
      if (retryToken) {
        headers.set('Authorization', `Bearer ${retryToken}`);
      }
      const retryResponse = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });

      if (!retryResponse.ok) {
        const errorData = await retryResponse.json().catch(() => ({}));
        throw new ApiError(
          retryResponse.status,
          errorData.error?.code || 'UNKNOWN_ERROR',
          errorData.error?.message || 'Request failed',
          errorData.error?.details,
        );
      }
      return retryResponse.json() as Promise<T>;
    } else {
      // Refresh failed: run local logout and terminate session
      await useAuthStore.getState().logout();
      throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
    }
  }

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new ApiError(
      response.status,
      errorData.error?.code || 'UNKNOWN_ERROR',
      errorData.error?.message || 'Request failed',
      errorData.error?.details,
    );
  }

  return response.json() as Promise<T>;
};
