import { randomUUID } from 'node:crypto';
import { MONTH_TZ, monthOf } from './activity';
import { getDb, mongoEnabled } from './mongo';

/*
 * Events live on the server, but only their name, setup and two counters. Photos are never sent or
 * stored here. Like users, everything goes through EventRepo so a database can replace the memory
 * copy by writing one new class.
 *
 * An event starts with just a name. The setup (product, shape, size, paper) is filled in inside the
 * event, so those four fields are null until then.
 *
 * Deleting an event is a soft delete: it gets a `deletedAt` date and disappears from the owner's list, but the
 * record and its counters stay, so the downloads and prints it had still count and can be traced to its name.
 * Records saved before this existed have no `deletedAt`, which means they are not deleted.
 */

export interface EventSetup {
  productId: string;
  shapeId: string;
  templateId: string;
  paperId: string;
}

export interface EventRecord {
  id: string;
  ownerId: string;
  name: string;
  setup: EventSetup | null;
  downloads: number;
  prints: number;
  createdAt: string;
  /** When the owner last downloaded or printed a sheet. Missing on events saved before this was kept. */
  lastActivityAt?: string | null;
  /** Set when the owner deleted the event. Missing or null means it is live. */
  deletedAt?: string | null;
}

/** What one user has done: how many events they have, and the downloads and prints across all of them (deleted ones too). */
export interface OwnerStats {
  events: number;
  downloads: number;
  prints: number;
}

export const NO_STATS: OwnerStats = { events: 0, downloads: 0, prints: 0 };

export interface EventRepo {
  create(input: { ownerId: string; name: string }): Promise<EventRecord>;
  /** A live event. Null when it does not exist or was deleted. */
  get(id: string): Promise<EventRecord | null>;
  /** The owner's live events, newest first. */
  listByOwner(ownerId: string): Promise<EventRecord[]>;
  /**
   * Totals per owner id. Pass an id to total just that owner. Downloads and prints include deleted events,
   * `events` counts only live ones. Owners with no events are missing from the result.
   */
  statsByOwner(ownerId?: string): Promise<Record<string, OwnerStats>>;
  /** How many events the owner created in each month (YYYY-MM, Indian time). Events the owner deleted are counted too. */
  createdByMonth(ownerId: string): Promise<Record<string, number>>;
  setSetup(id: string, setup: EventSetup): Promise<EventRecord | null>;
  increment(id: string, kind: 'downloads' | 'prints'): Promise<EventRecord | null>;
  /** Marks the event deleted if it is live and belongs to this owner. True when something changed. */
  delete(id: string, ownerId: string): Promise<boolean>;
  /**
   * Takes downloads and prints off an event's counters (never below zero), live or deleted. Used when the admin
   * deletes a month of counts for good.
   */
  subtract(id: string, ownerId: string, downloads: number, prints: number): Promise<void>;
}

class MemoryEventRepo implements EventRepo {
  private events: EventRecord[] = [];

  async create(input: { ownerId: string; name: string }) {
    const event: EventRecord = { ...input, id: randomUUID(), setup: null, downloads: 0, prints: 0, createdAt: new Date().toISOString(), lastActivityAt: null, deletedAt: null };
    this.events.push(event);
    return event;
  }
  async get(id: string) {
    return this.events.find((e) => e.id === id && !e.deletedAt) ?? null;
  }
  async listByOwner(ownerId: string) {
    return this.events.filter((e) => e.ownerId === ownerId && !e.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async statsByOwner(ownerId?: string) {
    const out: Record<string, OwnerStats> = {};
    for (const e of this.events) {
      if (ownerId && e.ownerId !== ownerId) continue;
      const s = (out[e.ownerId] ??= { events: 0, downloads: 0, prints: 0 });
      if (!e.deletedAt) s.events += 1;
      s.downloads += e.downloads;
      s.prints += e.prints;
    }
    return out;
  }
  async createdByMonth(ownerId: string) {
    const out: Record<string, number> = {};
    for (const e of this.events) if (e.ownerId === ownerId) out[monthOf(e.createdAt)] = (out[monthOf(e.createdAt)] ?? 0) + 1;
    return out;
  }
  async setSetup(id: string, setup: EventSetup) {
    const event = this.events.find((e) => e.id === id && !e.deletedAt);
    if (!event) return null;
    event.setup = setup;
    return event;
  }
  async increment(id: string, kind: 'downloads' | 'prints') {
    const event = this.events.find((e) => e.id === id && !e.deletedAt);
    if (!event) return null;
    event[kind] += 1;
    event.lastActivityAt = new Date().toISOString();
    return event;
  }
  async delete(id: string, ownerId: string) {
    const event = this.events.find((e) => e.id === id && e.ownerId === ownerId && !e.deletedAt);
    if (!event) return false;
    event.deletedAt = new Date().toISOString();
    return true;
  }
  async subtract(id: string, ownerId: string, downloads: number, prints: number) {
    const event = this.events.find((e) => e.id === id && e.ownerId === ownerId);
    if (!event) return;
    event.downloads = Math.max(0, event.downloads - downloads);
    event.prints = Math.max(0, event.prints - prints);
  }
}

type EventDoc = Omit<EventRecord, 'id'> & { _id: string };

const toRecord = ({ _id, ...rest }: EventDoc): EventRecord => ({ id: _id, ...rest });

// `deletedAt: null` also matches documents that have no such field, so events saved before soft delete count as live.
const LIVE = { deletedAt: null } as const;

class MongoEventRepo implements EventRepo {
  private col = async () => (await getDb()).collection<EventDoc>('events');

  async create(input: { ownerId: string; name: string }) {
    const doc: EventDoc = { ...input, _id: randomUUID(), setup: null, downloads: 0, prints: 0, createdAt: new Date().toISOString(), lastActivityAt: null, deletedAt: null };
    await (await this.col()).insertOne(doc);
    return toRecord(doc);
  }
  async get(id: string) {
    const doc = await (await this.col()).findOne({ _id: id, ...LIVE });
    return doc ? toRecord(doc) : null;
  }
  async listByOwner(ownerId: string) {
    return (await (await this.col()).find({ ownerId, ...LIVE }).sort({ createdAt: -1 }).toArray()).map(toRecord);
  }
  async statsByOwner(ownerId?: string) {
    const rows = await (await this.col())
      .aggregate<{ _id: string; events: number; downloads: number; prints: number }>([
        ...(ownerId ? [{ $match: { ownerId } }] : []),
        {
          $group: {
            _id: '$ownerId',
            events: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$deletedAt', null] }, null] }, 1, 0] } },
            downloads: { $sum: '$downloads' },
            prints: { $sum: '$prints' },
          },
        },
      ])
      .toArray();
    return Object.fromEntries(rows.map((r) => [r._id, { events: r.events, downloads: r.downloads, prints: r.prints }]));
  }
  async createdByMonth(ownerId: string) {
    // createdAt is kept as an ISO text, so it is turned into a date to find its month in Indian time
    const rows = await (await this.col())
      .aggregate<{ _id: string; n: number }>([
        { $match: { ownerId } },
        { $group: { _id: { $dateToString: { date: { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } }, format: '%Y-%m', timezone: MONTH_TZ } }, n: { $sum: 1 } } },
      ])
      .toArray();
    return Object.fromEntries(rows.filter((r) => r._id).map((r) => [r._id, r.n])); // a record with no date has no month
  }
  async setSetup(id: string, setup: EventSetup) {
    const doc = await (await this.col()).findOneAndUpdate({ _id: id, ...LIVE }, { $set: { setup } }, { returnDocument: 'after' });
    return doc ? toRecord(doc) : null;
  }
  async increment(id: string, kind: 'downloads' | 'prints') {
    // $inc is atomic, so two quick downloads or prints are never lost.
    const doc = await (await this.col()).findOneAndUpdate({ _id: id, ...LIVE }, { $inc: { [kind]: 1 }, $set: { lastActivityAt: new Date().toISOString() } }, { returnDocument: 'after' });
    return doc ? toRecord(doc) : null;
  }
  async delete(id: string, ownerId: string) {
    // The owner is part of the filter, so nobody can delete another user's event by guessing its id.
    const res = await (await this.col()).updateOne({ _id: id, ownerId, ...LIVE }, { $set: { deletedAt: new Date().toISOString() } });
    return res.modifiedCount === 1;
  }
  async subtract(id: string, ownerId: string, downloads: number, prints: number) {
    // one step in the database, so a download counted at the same moment is not lost, and never below zero
    await (await this.col()).updateOne({ _id: id, ownerId }, [
      { $set: { downloads: { $max: [0, { $subtract: [{ $ifNull: ['$downloads', 0] }, downloads] }] }, prints: { $max: [0, { $subtract: [{ $ifNull: ['$prints', 0] }, prints] }] } } },
    ]);
  }
}

// Kept on globalThis so Next.js dev reloads do not wipe the in-memory data.
// The key changed with the schema so an old dev-server copy is not reused.
const g = globalThis as unknown as { __jjEventsV9?: EventRepo };
export const eventRepo: EventRepo = (g.__jjEventsV9 ??= mongoEnabled() ? new MongoEventRepo() : new MemoryEventRepo());

/** What the browser is allowed to see. */
export function publicEvent(e: EventRecord) {
  const { ownerId: _omit, ...rest } = e;
  return rest;
}

export type PublicEvent = ReturnType<typeof publicEvent>;
