/**
 * Centralized API helper for the KSP Crime AI frontend.
 * Handles the API base URL, auth token storage, and authenticated requests.
 */

// API base URL — configurable via environment variable (CRA convention)
export const API_BASE =
  process.env.REACT_APP_API_BASE || 'http://localhost:8004';

const TOKEN_KEY = 'ksp_token';
const USER_KEY = 'ksp_user';

export interface AuthUser {
  username: string;
  name: string;
  role: string;
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
  const user: AuthUser = { username: data.username, name: data.name, role: data.role };
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

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    clearAuth();
    throw new Error('UNAUTHORIZED');
  }
  return res;
};
