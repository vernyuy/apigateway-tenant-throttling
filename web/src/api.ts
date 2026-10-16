import { idTokenFor } from './cognito';

export const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/?$/, '/');

export interface TenantView {
  tenantId: string;
  name: string;
  tier: string;
  apiKeyPreview: string;
  apiKeyEnabled: boolean;
  createdAt: string;
}

export interface TierDetails {
  name: string;
  rateLimit: number;
  burstLimit: number;
  quota: { limit: number; period: string };
}

export interface Throttle {
  rateLimit: number;
  burstLimit: number;
}

export interface Capacity {
  lambdaConcurrency: number;
  unreservedConcurrency: number;
}

export interface Credentials {
  apiKey: string;
  username: string;
  password: string;
}

export interface Employee {
  employeeId: string;
  name: string;
  title: string;
  department: string;
  email: string;
  location: string;
}

export interface Directory {
  company: { id: string; name: string; tier: string };
  count: number;
  employees: Employee[];
}

export interface DailyUsage {
  date: string;
  used: number;
  remaining: number;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function admin<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(new URL(`admin/${path}`, API_URL), {
    method,
    // Pasted tokens often carry a trailing newline or space, which the authorizer rejects.
    headers: { Authorization: `Bearer ${token.trim()}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? res.statusText);
  return data as T;
}

export const adminApi = (token: string) => ({
  list: () => admin<{ tenants: TenantView[]; tiers: TierDetails[]; stage?: Throttle; capacity?: Capacity | null }>(token, 'GET', 'tenants'),
  create: (name: string, tier: string) =>
    admin<{ tenant: TenantView; credentials: Credentials }>(token, 'POST', 'tenants', { name, tier }),
  changeTier: (id: string, tier: string) =>
    admin<{ tenant: TenantView; message: string }>(token, 'POST', `tenants/${id}/tier`, { tier }),
  rotate: (id: string) =>
    admin<{ tenant: TenantView; credentials: { apiKey: string } }>(token, 'POST', `tenants/${id}/api-key/rotate`),
  setEnabled: (id: string, enabled: boolean) =>
    admin<{ tenant: TenantView }>(token, 'POST', `tenants/${id}/api-key/enabled`, { enabled }),
  usage: (id: string) => admin<{ days: DailyUsage[] }>(token, 'GET', `tenants/${id}/usage`),
  remove: (id: string) => admin<{ deleted: string }>(token, 'DELETE', `tenants/${id}`),
});

/** GET /employees as a company's directory app: the ID token says who you are, the API key which plan you're on. */
async function getEmployees(creds: Credentials): Promise<Response> {
  return fetch(new URL('employees', API_URL), {
    cache: 'no-store',
    headers: { Authorization: await idTokenFor(creds.username, creds.password), 'x-api-key': creds.apiKey },
  });
}

/** For the traffic simulator: just the status code (0 for a network or sign-in error). */
export async function callEmployees(creds: Credentials): Promise<number> {
  try {
    return (await getEmployees(creds)).status;
  } catch {
    return 0;
  }
}

export async function fetchDirectory(creds: Credentials): Promise<Directory> {
  const res = await getEmployees(creds);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.message ?? res.statusText);
  return data as Directory;
}
