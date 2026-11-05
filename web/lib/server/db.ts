import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { Collection } from 'mongodb';
import type { OwnerStats } from './events';
import { addMonthsIso, daysLeft, isExpired, todayIso } from './expiry';
import { getDb, mongoEnabled } from './mongo';

/*
 * Data layer. Everything the server needs goes through UserRepo, so moving to a
 * real database later means writing one new implementation of this interface
 * and changing `userRepo` at the bottom of the file.
 */

export type Role = 'admin' | 'user';
export type UserStatus = 'active' | 'inactive';

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  lastLogin: string | null; // ISO timestamp
  expiresAt: string | null; // YYYY-MM-DD, the last day the account works. null = never (admins)
  passwordHash: string;
  createdAt: string;
  /** The one device that is signed in (checked for users, not for admins). Signing in somewhere else replaces it. */
  sessionId?: string | null;
  /** The last time the person was seen using the app. A session with none for too long ends. */
  lastSeenAt?: string | null;
}

export type NewUser = Pick<UserRecord, 'name' | 'email' | 'role' | 'status' | 'expiresAt'> & { password: string };
export type UserPatch = Partial<Pick<UserRecord, 'name' | 'email' | 'status' | 'lastLogin' | 'expiresAt' | 'sessionId' | 'lastSeenAt'>> & { password?: string };

export interface UserRepo {
  list(): Promise<UserRecord[]>;
  get(id: string): Promise<UserRecord | null>;
  getByEmail(email: string): Promise<UserRecord | null>;
  create(input: NewUser): Promise<UserRecord>;
  update(id: string, patch: UserPatch): Promise<UserRecord | null>;
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
}

// Kept on globalThis so Next.js dev reloads do not wipe the in-memory data or reopen the database.
// The key changed with the schema so an old dev-server copy is not reused.
const g = globalThis as unknown as { __jjUsersV4?: UserRepo };
export const userRepo: UserRepo = (g.__jjUsersV4 ??= mongoEnabled()
  ? new MongoUserRepo()
  : process.env.NODE_ENV === 'production'
    ? new UnconfiguredUserRepo()
    : new MemoryUserRepo());

/** What the browser may see. The admin Users page passes each user's event totals in `stats`. */
export function publicUser(u: UserRecord, stats?: OwnerStats) {
  const { passwordHash: _omit, sessionId: _sid, ...rest } = u;
  return { ...rest, expired: isExpired(u), daysLeft: u.role === 'user' ? daysLeft(u.expiresAt) : null, stats: stats ?? null };
}

export type PublicUser = ReturnType<typeof publicUser>;
