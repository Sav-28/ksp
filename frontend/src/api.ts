/**
 * Centralized API helper for the KSP Crime AI frontend.
 * Handles the API base URL, auth token storage, and authenticated requests.
 */

// API base URL — configurable via environment variable (CRA convention).
// An empty string means "same origin" (used when the backend also serves the
// frontend build, e.g. on Catalyst AppSail — avoids all cross-origin/CORS).
// `??` (not `||`) so an intentionally-empty value is preserved.
export const API_BASE =
  process.env.REACT_APP_API_BASE ?? 'http://localhost:8004';

const TOKEN_KEY = 'ksp_token';
const USER_KEY = 'ksp_user';

export interface AuthUser {
  username: string;
  name: string;
  role: string;
  can_register?: boolean;
  can_update_case?: boolean;
  can_close_case?: boolean;
}

export const getToken = (): string | null => localStorage.getItem(TOKEN_KEY);

export const getUser = (): AuthUser | null => {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
};

export const setAuth = (token: string, user: AuthUser): void => {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const clearAuth = (): void => {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
};

export const isAuthenticated = (): boolean => !!getToken();

/** Log in and persist the token. Throws on failure. */
export const login = async (username: string, password: string): Promise<AuthUser> => {
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || 'Login failed');
  }

  const data = await res.json();
  const user: AuthUser = {
    username: data.username, name: data.name, role: data.role,
    can_register: data.can_register,
    can_update_case: data.can_update_case,
    can_close_case: data.can_close_case,
  };
  setAuth(data.token, user);
  return user;
};

/**
 * Authenticated fetch wrapper. Adds the Bearer token and JSON headers.
 * Throws an 'UNAUTHORIZED' error if the token is rejected (so callers can
 * redirect to login).
 */
export const apiFetch = async (path: string, options: RequestInit = {}): Promise<Response> => {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Never let the browser serve a cached response for API calls. Without this,
  // a stale 200 (e.g. the SPA index.html returned by the server fallback before
  // a route existed) can get cached and replayed, breaking JSON parsing.
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, cache: 'no-store' });

  if (res.status === 401) {
    clearAuth();
    throw new Error('UNAUTHORIZED');
  }
  return res;
};
