import type { PublicUser } from './server/db';
import type { EventSetup, PublicEvent } from './server/events';

export type { PublicUser };

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.message ?? 'Something went wrong.', res.status, data.code);
  return data as T;
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body ?? {}) });

export const api = {
  login: (email: string, password: string) => call<{ user: PublicUser; redirectTo: string }>('/api/auth/login', post({ email, password })),
  ping: () => call<{ ok: true }>('/api/auth/ping', post()),
  logout: () => call<{ ok: true }>('/api/auth/logout', post()),
  changePassword: (current: string, next: string) => call<{ ok: true }>('/api/auth/password', post({ current, next })),
  createEvent: (name: string) => call<{ event: PublicEvent }>('/api/events', post({ name })),
  setupEvent: (id: string, setup: EventSetup) =>
    call<{ event: PublicEvent }>(`/api/events/${id}`, { method: 'PATCH', body: JSON.stringify(setup) }),
  countEvent: (id: string, kind: 'download' | 'print', detail?: { format?: 'jpeg' | 'pdf'; dpi?: number; photos?: number }) =>
    call<{ event: PublicEvent }>(`/api/events/${id}/count`, post({ kind, ...detail })),
  users: () => call<{ users: PublicUser[] }>('/api/admin/users'),
  createUser: (body: { name: string; email: string; password: string; expiresAt?: string }) => call<{ user: PublicUser }>('/api/admin/users', post(body)),
  updateUser: (id: string, body: { name?: string; email?: string; expiresAt?: string; status?: 'active' | 'inactive'; password?: string }) =>
    call<{ user: PublicUser }>(`/api/admin/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
};
