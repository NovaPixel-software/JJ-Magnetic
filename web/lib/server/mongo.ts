import { MongoClient, type Db } from 'mongodb';

/*
 * One MongoDB connection for the whole server. Set PRINTPIX_MONGODB_URI (or MONGODB_URI), and optionally
 * MONGODB_DB, in .env.local to use it. Without a URI the app keeps its data in memory instead.
 *
 * Only users and events are stored here. Photos never reach the server.
 */

// PRINTPIX_MONGODB_URI wins over MONGODB_URI. Vercel's MongoDB integration injects its own locked
// MONGODB_URI that cannot be edited, so the app has its own name to point at the right cluster.
const mongoUri = () => process.env.PRINTPIX_MONGODB_URI || process.env.MONGODB_URI;

export const mongoEnabled = () => Boolean(mongoUri());

// Kept on globalThis so Next.js dev reloads reuse the same connection.
const g = globalThis as unknown as { __printpixMongo?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!g.__printpixMongo) {
    g.__printpixMongo = (async () => {
      const client = new MongoClient(mongoUri()!, { serverSelectionTimeoutMS: 8000 });
      await client.connect();
      const db = client.db(process.env.MONGODB_DB || 'printpix');
      await Promise.all([
        db.collection('users').createIndex({ email: 1 }, { unique: true }),
        db.collection('events').createIndex({ ownerId: 1, createdAt: -1 }),
        // the activity log (one record per download or print): by owner and date for the date ranges, by event for its history
        db.collection('activity').createIndex({ ownerId: 1, createdAt: -1 }),
        db.collection('activity').createIndex({ eventId: 1, createdAt: -1 }),
      ]);
      return db;
    })().catch((e) => {
      g.__printpixMongo = undefined; // try again on the next request instead of failing forever
      throw e;
    });
  }
  return g.__printpixMongo;
}
