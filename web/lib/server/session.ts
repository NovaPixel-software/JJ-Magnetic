import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { allowedSessions, userRepo, type Role, type UserRecord } from './db';
import { IDLE_MINUTES } from '../session-config';
import { isExpired } from './expiry';

export const SESSION_COOKIE = 'jj_session';
const SESSION_DAYS = 7;

const g = globalThis as unknown as { __jjSecret?: string };
const secret = () => (g.__jjSecret ??= process.env.SESSION_SECRET || randomBytes(32).toString('hex'));

const sign = (payload: string) => createHmac('sha256', secret()).update(payload).digest('base64url');

/** A new id for a sign-in. Saved on the account, which is how a device is told apart and can be signed out. */
export const newSessionId = () => randomBytes(16).toString('hex');

export function createSessionToken(userId: string, sid: string, days = SESSION_DAYS): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, sid, exp: Date.now() + days * 864e5 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  secure: process.env.NODE_ENV === 'production',
  maxAge: SESSION_DAYS * 24 * 3600,
});

function readToken(token: string | undefined): { uid: string; sid: string | null } | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const { uid, sid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return typeof uid === 'string' && typeof exp === 'number' && exp > Date.now() ? { uid, sid: typeof sid === 'string' ? sid : null } : null;
  } catch {
    return null;
  }
}

/** Where each role lands after sign-in. */
export const homeFor = (role: Role) => (role === 'admin' ? '/admin' : '/events');

/**
 * The signed-in account, or null when there is no valid session or the account is inactive.
 * Checked against the repo on every call, so an admin marking someone inactive takes effect on
 * their very next request.
 */
export async function getSession(): Promise<UserRecord | null> {
  return (await readSession())?.user ?? null;
}

/** The signed-in account together with the id of this device's session (see getSession for when it is null). */
export async function readSession(): Promise<{ user: UserRecord; sid: string | null } | null> {
  const store = await cookies();
  const token = readToken(store.get(SESSION_COOKIE)?.value);
  if (!token) return null;
  const user = await userRepo.get(token.uid);
  // An expired account stops working on its next request, same as an inactive one.
  if (!user || user.status !== 'active' || isExpired(user)) return null;

  const fresh = (at: string | null | undefined) => {
    const seen = at ? Date.parse(at) : 0;
    return !!seen && Date.now() - seen <= IDLE_MINUTES * 60e3;
  };

  if (user.role === 'user') {
    // A user is signed in on as many devices as the admin allows. This device must be one of the most recently
    // used ones, up to that number: one pushed out by a newer sign-in is signed out on its next request.
    const mine = token.sid ? allowedSessions(user).find((s) => s.sid === token.sid) : undefined;
    // Not used for too long: this device's session has ended, whatever the browser says. Other devices are not affected.
    if (!mine || !fresh(mine.seenAt)) return null;
  } else if (!fresh(user.lastSeenAt)) {
    return null; // admins have no device limit, only the idle time
  }
  return { user, sid: token.sid };
}

/** For user pages. Signed-out goes to /login; an admin goes to the admin page. */
export async function requireUser(): Promise<UserRecord> {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.role !== 'user') redirect(homeFor(user.role));
  return user;
}

/** For admin pages. Signed-out goes to /login; a user goes to their events. */
export async function requireAdmin(): Promise<UserRecord> {
  const user = await getSession();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect(homeFor(user.role));
  return user;
}
