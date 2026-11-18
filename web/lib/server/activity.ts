import { randomUUID } from 'node:crypto';
import { getDb, mongoEnabled } from './mongo';

/*
 * The activity log: one record for every download or print, with its date. The event's own counters give the
 * totals; this log is what answers "how many today / this week", and it keeps the event's name as it was, so a
 * record still says which event it belonged to after that event is deleted. Photos are never part of it.
 */

export type ActivityKind = 'download' | 'print';

export interface ActivityRecord {
  id: string;
  ownerId: string;
  eventId: string;
  /** The event's name when this happened. */
  eventName: string;
  kind: ActivityKind;
  format: 'jpeg' | 'pdf' | 'png' | null;
  dpi: number | null;
  /** How many photos were on the sheet. */
  photos: number | null;
  createdAt: string;
}

export type NewActivity = Omit<ActivityRecord, 'id' | 'createdAt'>;

/** One calendar month of an owner's downloads and prints. */
export interface MonthCount {
  /** YYYY-MM, in Indian time. */
  month: string;
  downloads: number;
  prints: number;
}

/** One row of the admin's month by month table: the counts, and how many events were created in that month. */
export interface MonthRow extends MonthCount {
  events: number;
}

/** Months are counted in Indian time, so a sheet made at 1 am on the 1st belongs to the new month. */
export const MONTH_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 5.5 * 3600e3;
/** The month (YYYY-MM, Indian time) an ISO time falls in. */
export const monthOf = (iso: string) => new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 7);

/** The first moment of a month (YYYY-MM) in Indian time and of the month after it, as ISO times. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1) - IST_OFFSET_MS).toISOString(), to: new Date(Date.UTC(y, m, 1) - IST_OFFSET_MS).toISOString() };
}

const toMonths = (rows: { month: string; kind: ActivityKind; n: number }[]): MonthCount[] => {
  const out: Record<string, MonthCount> = {};
  for (const r of rows) {
    if (!r.month) continue; // a record with no usable date has no month
    const m = (out[r.month] ??= { month: r.month, downloads: 0, prints: 0 });
    if (r.kind === 'download') m.downloads += r.n;
    else m.prints += r.n;
  }
  return Object.values(out).sort((a, b) => b.month.localeCompare(a.month));
};

export interface ActivityRepo {
  add(input: NewActivity): Promise<ActivityRecord>;
  /** The owner's records, newest first. With `since` (an ISO time), only those made at or after it. */
  listByOwner(ownerId: string, since?: string): Promise<ActivityRecord[]>;
  /** Downloads and prints per event id since an ISO time. Events with none are missing from the result. */
  countsByEvent(ownerId: string, since: string): Promise<Record<string, { downloads: number; prints: number }>>;
  /** The owner's downloads and prints for every month that has any, newest month first. Deleted events are included. */
  monthlyByOwner(ownerId: string): Promise<MonthCount[]>;
  /** Downloads and prints per event id for the records made from `from` up to, not including, `to` (ISO times). */
  countsByEventBetween(ownerId: string, from: string, to: string): Promise<Record<string, { downloads: number; prints: number }>>;
  /** Removes those records for good. Returns how many were removed. */
  deleteBetween(ownerId: string, from: string, to: string): Promise<number>;
}

class MemoryActivityRepo implements ActivityRepo {
  private rows: ActivityRecord[] = [];

  async add(input: NewActivity) {
    const row: ActivityRecord = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
    this.rows.push(row);
    return row;
  }
  async listByOwner(ownerId: string, since?: string) {
    return this.rows.filter((r) => r.ownerId === ownerId && (!since || r.createdAt >= since)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  async countsByEvent(ownerId: string, since: string) {
    return tally(this.rows.filter((r) => r.ownerId === ownerId && r.createdAt >= since).map((r) => ({ eventId: r.eventId, kind: r.kind, n: 1 })));
  }
  async monthlyByOwner(ownerId: string) {
    return toMonths(this.rows.filter((r) => r.ownerId === ownerId).map((r) => ({ month: monthOf(r.createdAt), kind: r.kind, n: 1 })));
  }
  async countsByEventBetween(ownerId: string, from: string, to: string) {
    return tally(this.rows.filter((r) => r.ownerId === ownerId && r.createdAt >= from && r.createdAt < to).map((r) => ({ eventId: r.eventId, kind: r.kind, n: 1 })));
  }
  async deleteBetween(ownerId: string, from: string, to: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => !(r.ownerId === ownerId && r.createdAt >= from && r.createdAt < to));
    return before - this.rows.length;
  }
}


const tally = (rows: { eventId: string; kind: ActivityKind; n: number }[]) => {
  const out: Record<string, { downloads: number; prints: number }> = {};
  for (const r of rows) {
    const c = (out[r.eventId] ??= { downloads: 0, prints: 0 });
    if (r.kind === 'download') c.downloads += r.n;
    else c.prints += r.n;
  }
  return out;
};

type ActivityDoc = Omit<ActivityRecord, 'id'> & { _id: string };

class MongoActivityRepo implements ActivityRepo {
  private col = async () => (await getDb()).collection<ActivityDoc>('activity');

  async add(input: NewActivity) {
    const doc: ActivityDoc = { ...input, _id: randomUUID(), createdAt: new Date().toISOString() };
    await (await this.col()).insertOne(doc);
    const { _id, ...rest } = doc;
    return { id: _id, ...rest };
  }
  async listByOwner(ownerId: string, since?: string) {
    const rows = await (await this.col())
      .find({ ownerId, ...(since ? { createdAt: { $gte: since } } : {}) })
      .sort({ createdAt: -1 })
      .limit(20000)
      .toArray();
    return rows.map(({ _id, ...rest }) => ({ id: _id, ...rest }));
  }
  async countsByEvent(ownerId: string, since: string) {
    // counted by the database, so the page never loads the records themselves
    const rows = await (await this.col())
      .aggregate<{ _id: { e: string; k: ActivityKind }; n: number }>([
        { $match: { ownerId, createdAt: { $gte: since } } },
        { $group: { _id: { e: '$eventId', k: '$kind' }, n: { $sum: 1 } } },
      ])
      .toArray();
    return tally(rows.map((r) => ({ eventId: r._id.e, kind: r._id.k, n: r.n })));
  }
  async monthlyByOwner(ownerId: string) {
    // createdAt is kept as an ISO text, so it is turned into a date to find its month in Indian time
    const rows = await (await this.col())
      .aggregate<{ _id: { m: string; k: ActivityKind }; n: number }>([
        { $match: { ownerId } },
        { $group: { _id: { m: { $dateToString: { date: { $convert: { input: '$createdAt', to: 'date', onError: null, onNull: null } }, format: '%Y-%m', timezone: MONTH_TZ } }, k: '$kind' }, n: { $sum: 1 } } },
      ])
      .toArray();
    return toMonths(rows.map((r) => ({ month: r._id.m, kind: r._id.k, n: r.n })));
  }
  async countsByEventBetween(ownerId: string, from: string, to: string) {
    const rows = await (await this.col())
      .aggregate<{ _id: { e: string; k: ActivityKind }; n: number }>([
        { $match: { ownerId, createdAt: { $gte: from, $lt: to } } },
        { $group: { _id: { e: '$eventId', k: '$kind' }, n: { $sum: 1 } } },
      ])
      .toArray();
    return tally(rows.map((r) => ({ eventId: r._id.e, kind: r._id.k, n: r.n })));
  }
  async deleteBetween(ownerId: string, from: string, to: string) {
    // the owner is always part of the filter, so one user's month can never remove another user's records
    return (await (await this.col()).deleteMany({ ownerId, createdAt: { $gte: from, $lt: to } })).deletedCount;
  }
}

const g = globalThis as unknown as { __jjActivityV5?: ActivityRepo };
export const activityRepo: ActivityRepo = (g.__jjActivityV5 ??= mongoEnabled() ? new MongoActivityRepo() : new MemoryActivityRepo());
