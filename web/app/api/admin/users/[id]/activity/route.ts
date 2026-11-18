import { NextResponse } from 'next/server';
import { activityRepo, monthRange, type MonthRow } from '@/lib/server/activity';
import { userRepo } from '@/lib/server/db';
import { eventRepo, NO_STATS } from '@/lib/server/events';
import { getSession } from '@/lib/server/session';

type Ctx = { params: Promise<{ id: string }> };

/** The user this request is about, or the answer to send instead when the caller is not an admin or there is no such user. */
async function userFor(params: Ctx['params']) {
  const me = await getSession();
  if (!me) return { denied: NextResponse.json({ message: 'Not signed in.' }, { status: 401 }) };
  if (me.role !== 'admin') return { denied: NextResponse.json({ message: 'Admins only.' }, { status: 403 }) };
  const { id } = await params;
  const user = await userRepo.get(id);
  if (!user || user.role !== 'user') return { denied: NextResponse.json({ message: 'User not found.' }, { status: 404 }) };
  return { id };
}

async function summary(id: string) {
  const [counts, created, stats] = await Promise.all([activityRepo.monthlyByOwner(id), eventRepo.createdByMonth(id), eventRepo.statsByOwner(id)]);
  // A month is listed when it has downloads or prints, or when an event was created in it.
  const rows: Record<string, MonthRow> = {};
  for (const c of counts) rows[c.month] = { ...c, events: 0 };
  for (const [month, n] of Object.entries(created)) (rows[month] ??= { month, downloads: 0, prints: 0, events: 0 }).events = n;
  const months = Object.values(rows).sort((a, b) => b.month.localeCompare(a.month));
  const { downloads, prints } = stats[id] ?? NO_STATS;
  // every event ever created and still kept, the user's deleted ones too
  return { months, total: { downloads, prints, events: months.reduce((t, m) => t + m.events, 0) } };
}

// For the admin: one user's downloads and prints month by month, and the all-time total.
// Both include events the user deleted, so a user deleting an event never lowers what the admin sees.
export async function GET(_req: Request, { params }: Ctx) {
  const who = await userFor(params);
  if (who.denied) return who.denied;
  return NextResponse.json(await summary(who.id));
}

// The admin deletes one month of a user's counts, for good: that month's records are removed and taken off the
// totals. The events themselves are kept, so the events-per-month numbers do not move. `?month=YYYY-MM`. It cannot be undone.
export async function DELETE(req: Request, { params }: Ctx) {
  const who = await userFor(params);
  if (who.denied) return who.denied;
  const { id } = who;

  const month = new URL(req.url).searchParams.get('month') ?? '';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ message: 'Choose a month.' }, { status: 400 });

  // Only what exists right now is counted and removed, with the same end time for both, so a download made while
  // this runs is neither lost from the totals nor taken off twice.
  const { from, to: monthEnd } = monthRange(month);
  const now = new Date().toISOString();
  const to = monthEnd < now ? monthEnd : now;

  const counts = await activityRepo.countsByEventBetween(id, from, to);
  const removed = await activityRepo.deleteBetween(id, from, to);
  for (const [eventId, c] of Object.entries(counts)) await eventRepo.subtract(eventId, id, c.downloads, c.prints);

  return NextResponse.json({ ...(await summary(id)), removed });
}
