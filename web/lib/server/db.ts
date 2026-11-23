import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Collection } from 'mongodb';
import type { OwnerStats } from './events';
import { addMonthsIso, daysLeft, isExpired, todayIso } from './expiry';
import { getDb, mongoEnabled } from './mongo';
import { IDLE_MINUTES } from '../session-config';

/*
 * Data layer. Everything the server needs goes through UserRepo, so moving to a
 * real database later means writing one new implementation of this interface
 * and changing `userRepo` at the bottom of the file.
 */

export type Role = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

/** One signed-in device of a user. */
export interface DeviceSession {
  /** The id inside that device's session cookie. */
  sid: string;
  /** When that device was last seen using the app. One that is idle too long is signed out. */
  seenAt: string;
  createdAt: string;
}

/** How many devices a user can be signed in on at once when the admin has not set a number. */
export const DEFAULT_MAX_DEVICES = 1;
export const MAX_DEVICES_LIMIT = 50;

/** The number of devices this user may be signed in on at once. */
export const maxDevicesOf = (u: Pick<UserRecord, 'maxDevices'>) => Math.min(MAX_DEVICES_LIMIT, Math.max(1, Math.floor(u.maxDevices ?? DEFAULT_MAX_DEVICES)));

/** A whole number from 1 to the limit, or null when the value is not one. */
export function parseMaxDevices(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_DEVICES_LIMIT ? n : null;
}

/**
 * A phone number as it is kept: digits, with a leading + when one was typed. Spaces, dashes and brackets are dropped.
 * Empty text gives '' (no number). Null when it is not a phone number (7 to 15 digits).
 */
export function parsePhone(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return '';
  if (!/^\+?[\d\s().-]+$/.test(t)) return null;
  const digits = t.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15 ? (t.startsWith('+') ? '+' : '') + digits : null;
}

/**
 * The devices a user is signed in on. An account saved before there was a list has only the one `sessionId`,
 * which counts as its single device, so nobody is signed out by the change.
 */
export function sessionsOf(u: Pick<UserRecord, 'sessions' | 'sessionId' | 'lastSeenAt' | 'lastLogin'>): DeviceSession[] {
  if (u.sessions) return u.sessions;
  return u.sessionId ? [{ sid: u.sessionId, seenAt: u.lastSeenAt ?? '', createdAt: u.lastLogin ?? '' }] : [];
}

const isLive = (s: DeviceSession, now = Date.now()) => now - (Date.parse(s.seenAt) || 0) <= IDLE_MINUTES * 60e3;

/**
 * The sessions that count: the most recently used ones, up to the user's limit. A device beyond the limit is
 * signed out on its next request, which is also what happens when the admin lowers the number.
 */
export function allowedSessions(u: UserRecord): DeviceSession[] {
  return [...sessionsOf(u)].sort((a, b) => b.seenAt.localeCompare(a.seenAt)).slice(0, maxDevicesOf(u));
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  /** The person's phone number, for the admin to reach them. Missing or '' when none was given. */
  phone?: string;
  role: Role;
  status: UserStatus;
  lastLogin: string | null; // ISO timestamp
  expiresAt: string | null; // YYYY-MM-DD, the last day the account works. null = never (admins)
  passwordHash: string;
  createdAt: string;
  /** The newest sign-in. Before `sessions` existed this was the one signed-in device, see sessionsOf. */
  sessionId?: string | null;
  /** The devices a user is signed in on (not kept for admins). Never sent to the browser. */
  sessions?: DeviceSession[];
  /** How many devices a user may be signed in on at once. Missing means 1. Set by the admin. */
  maxDevices?: number;
  /** The last time the person was seen using the app, on any device. An admin's session ends when this is too long ago. */
  lastSeenAt?: string | null;
}

export type NewUser = Pick<UserRecord, 'name' | 'email' | 'role' | 'status' | 'expiresAt'> & { password: string; maxDevices?: number; phone?: string };
export type UserPatch = Partial<Pick<UserRecord, 'name' | 'email' | 'phone' | 'status' | 'lastLogin' | 'expiresAt' | 'sessionId' | 'lastSeenAt' | 'sessions' | 'maxDevices'>> & { password?: string };

export interface UserRepo {
  list(): Promise<UserRecord[]>;
  get(id: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  create(input: NewUser): Promise<UserRecord>;
  update(id: string, patch: UserPatch): Promise<UserRecord | null>;
  /**
   * A user signed in on a device. The session joins the list, and only the `max` most recently used stay, so the
   * device unused the longest is the one signed out. Done in one step, so two sign-ins at once cannot lose each other.
   */
  addSession(id: string, session: DeviceSession, max: number): Promise<void>;
  /** The person is using the app right now: marks the account, and that device's session, as just seen. */
  touchSession(id: string, sid: string | null, now: string): Promise<void>;
  /** A device signed out, which frees its place. */
  removeSession(id: string, sid: string): Promise<void>;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 32);
  return a.length === b.length && timingSafeEqual(a, b);
}

function seed(): UserRecord[] {
  const make = (
    name: string,
    email: string,
    role: Role,
    status: UserStatus,
    password: string,
    lastLoginHoursAgo: number | null,
    expiresAt: string | null,
  ): UserRecord => ({
    id: randomBytes(6).toString('hex'),
    name,
    email,
    role,
    status,
    expiresAt,
    lastLogin: lastLoginHoursAgo == null ? null : new Date(Date.now() - lastLoginHoursAgo * 36e5).toISOString(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  });
  return [
    make('Sarah Jenkins', 'admin@example.com', 'admin', 'active', 'admin123', 0, null),
    make('Marcus Vance', 'marcus@example.com', 'user', 'active', 'user12345', 2, addMonthsIso(todayIso(), 12)),
    make('Elena Rostova', 'elena@example.com', 'user', 'active', 'user12345', 18, addMonthsIso(todayIso(), 1)),
    make('David Kalu', 'david@example.com', 'user', 'inactive', 'user12345', 120, addMonthsIso(todayIso(), 12)),
  ];
}

class MemoryUserRepo implements UserRepo {
  private users: UserRecord[] = seed();

  async list() {
    return [...this.users];
  }
  async get(id: string) {
    return this.users.find((u) => u.id === id) ?? null;
  }
  async getByEmail(email: string) {
    const e = email.trim().toLowerCase();
    return this.users.find((u) => u.email.toLowerCase() === e) ?? null;
  }
  async create(input: NewUser) {
    const { password, ...rest } = input;
    const user: UserRecord = {
      ...rest,
      id: randomBytes(6).toString('hex'),
      lastLogin: null,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    this.users.push(user);
    return user;
  }
  async update(id: string, patch: UserPatch) {
    const user = this.users.find((u) => u.id === id);
    if (!user) return null;
    const { password, ...rest } = patch;
    Object.assign(user, rest);
    if (password) user.passwordHash = hashPassword(password);
    return user;
  }
  async addSession(id: string, session: DeviceSession, max: number) {
    const user = this.users.find((u) => u.id === id);
    if (!user) return;
    user.sessions = [...(user.sessions ?? []), session].sort((a, b) => a.seenAt.localeCompare(b.seenAt)).slice(-max);
    user.sessionId = session.sid;
    user.lastLogin = user.lastSeenAt = session.seenAt;
  }
  async touchSession(id: string, sid: string | null, now: string) {
    const user = this.users.find((u) => u.id === id);
    if (!user) return;
    user.lastSeenAt = now;
    const s = user.sessions?.find((x) => x.sid === sid);
    if (s) s.seenAt = now;
  }
  async removeSession(id: string, sid: string) {
    const user = this.users.find((u) => u.id === id);
    if (user?.sessions) user.sessions = user.sessions.filter((x) => x.sid !== sid);
  }
}

type UserDoc = Omit<UserRecord, 'id'> & { _id: string };

// Documents saved before expiry existed have no expiresAt, which means they never expire.
const toRecord = ({ _id, expiresAt, ...rest }: UserDoc): UserRecord => ({ id: _id, expiresAt: expiresAt ?? null, ...rest });

class MongoUserRepo implements UserRepo {
  private ready?: Promise<Collection<UserDoc>>;

  /** The users collection. The first time, it creates the admin from ADMIN_EMAIL / ADMIN_PASSWORD if there is none yet. */
  private col(): Promise<Collection<UserDoc>> {
    this.ready ??= (async () => {
      const col = (await getDb()).collection<UserDoc>('users');
      const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD;
      if (email && password && (await col.countDocuments({ role: 'admin' })) === 0) {
        await col
          .insertOne({
            _id: randomBytes(6).toString('hex'),
            name: process.env.ADMIN_NAME?.trim() || 'Admin',
            email,
            role: 'admin',
            status: 'active',
            expiresAt: null,
            lastLogin: null,
            passwordHash: hashPassword(password),
            createdAt: new Date().toISOString(),
          })
          // Two serverless instances can start together and both try to create the admin. The unique
          // email index lets only one win, so the other must not fail the request.
          .catch((e: { code?: number }) => {
            if (e.code !== 11000) throw e;
          });
      }
      return col;
    })().catch((e) => {
      this.ready = undefined;
      throw e;
    });
    return this.ready;
  }

  async list() {
    return (await (await this.col()).find().sort({ createdAt: 1 }).toArray()).map(toRecord);
  }
  async get(id: string) {
    const doc = await (await this.col()).findOne({ _id: id });
    return doc ? toRecord(doc) : null;
  }
  async getByEmail(email: string) {
    const doc = await (await this.col()).findOne({ email: email.trim().toLowerCase() });
    return doc ? toRecord(doc) : null;
  }
  async create(input: NewUser) {
    const { password, ...rest } = input;
    const doc: UserDoc = {
      ...rest,
      email: rest.email.trim().toLowerCase(),
      _id: randomBytes(6).toString('hex'),
      lastLogin: null,
      passwordHash: hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await (await this.col()).insertOne(doc);
    return toRecord(doc);
  }
  async update(id: string, patch: UserPatch) {
    const { password, ...rest } = patch;
    const set: Partial<UserDoc> = { ...rest };
    if (password) set.passwordHash = hashPassword(password);
    const doc = await (await this.col()).findOneAndUpdate({ _id: id }, { $set: set }, { returnDocument: 'after' });
    return doc ? toRecord(doc) : null;
  }
  async addSession(id: string, session: DeviceSession, max: number) {
    // $push with $sort and $slice is one atomic step: add the session, keep only the `max` most recently seen.
    await (await this.col()).updateOne(
      { _id: id },
      {
        $set: { lastLogin: session.seenAt, lastSeenAt: session.seenAt, sessionId: session.sid },
        $push: { sessions: { $each: [session], $sort: { seenAt: 1 }, $slice: -max } },
      },
    );
  }
  async touchSession(id: string, sid: string | null, now: string) {
    const col = await this.col();
    // Only this device's entry is written, so devices pinging at the same moment never overwrite each other.
    const hit = sid ? await col.updateOne({ _id: id, 'sessions.sid': sid }, { $set: { 'sessions.$.seenAt': now, lastSeenAt: now } }) : null;
    if (!hit?.matchedCount) await col.updateOne({ _id: id }, { $set: { lastSeenAt: now } }); // an admin, or an account from before the list
  }
  async removeSession(id: string, sid: string) {
    await (await this.col()).updateOne({ _id: id }, { $pull: { sessions: { sid } } });
  }
}

/**
 * In production there is no memory fallback. It would start with the demo accounts (a known admin password), so a
 * server that lost its database setting would let anyone in. This stands in instead and fails every call with a clear message.
 */
class UnconfiguredUserRepo implements UserRepo {
  private fail(): never {
    throw new Error('The database is not set up on this server. Set JJ_MONGODB_URI (and MONGODB_DB) in the environment variables.');
  }
  async list(): Promise<UserRecord[]> { return this.fail(); }
  async get(): Promise<UserRecord | null> { return this.fail(); }
  async getByEmail(): Promise<UserRecord | null> { return this.fail(); }
  async create(): Promise<UserRecord> { return this.fail(); }
  async update(): Promise<UserRecord | null> { return this.fail(); }
  async addSession(): Promise<void> { return this.fail(); }
  async touchSession(): Promise<void> { return this.fail(); }
  async removeSession(): Promise<void> { return this.fail(); }
}

// Kept on globalThis so Next.js dev reloads do not wipe the in-memory data or reopen the database.
// The key changed with the schema so an old dev-server copy is not reused.
const g = globalThis as unknown as { __jjUsersV5?: UserRepo };
export const userRepo: UserRepo = (g.__jjUsersV5 ??= mongoEnabled()
  ? new MongoUserRepo()
  : process.env.NODE_ENV === 'production'
    ? new UnconfiguredUserRepo()
    : new MemoryUserRepo());

/** What the browser may see. The admin Users page passes each user's event totals in `stats`. */
export function publicUser(u: UserRecord, stats?: OwnerStats) {
  // session ids are what a cookie is checked against, so they never leave the server
  const { passwordHash: _omit, sessionId: _sid, sessions: _sessions, ...rest } = u;
  const isUser = u.role === 'user';
  return {
    ...rest,
    expired: isExpired(u),
    daysLeft: isUser ? daysLeft(u.expiresAt) : null,
    stats: stats ?? null,
    /** How many devices this user may be signed in on at once. */
    maxDevices: maxDevicesOf(u),
    /** How many are signed in and in use right now (idle ones are not counted). Null for an admin. */
    devicesInUse: isUser ? allowedSessions(u).filter((s) => isLive(s)).length : null,
  };
}

export type PublicUser = ReturnType<typeof publicUser>;
