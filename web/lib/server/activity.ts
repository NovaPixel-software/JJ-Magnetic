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

export interface ActivityRepo {
  add(input: NewActivity): Promise<ActivityRecord>;
  /** The owner's records, newest first. With `since` (an ISO time), only those made at or after it. */
  listByOwner(ownerId: string, since?: string): Promise<ActivityRecord[]>;
  /** Downloads and prints per event id since an ISO time. Events with none are missing from the result. */
  countsByEvent(ownerId: string, since: string): Promise<Record<string, { downloads: number; prints: number }>>;
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
}

const g = globalThis as unknown as { __jjActivityV2?: ActivityRepo };
export const activityRepo: ActivityRepo = (g.__jjActivityV2 ??= mongoEnabled() ? new MongoActivityRepo() : new MemoryActivityRepo());
