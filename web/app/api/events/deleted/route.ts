import { NextResponse } from 'next/server';
import { DELETED_PAGE, RANGES } from '@/lib/ranges';
import { activityRepo } from '@/lib/server/activity';
import { toRow } from '@/lib/server/event-rows';
import { eventRepo } from '@/lib/server/events';
import { getSession } from '@/lib/server/session';

// One page of the owner's deleted events, for the "Deleted events" box that loads only when it is opened.
// `range` makes the downloads and prints those of that time range, like the table above it.
export async function GET(req: Request) {
  const me = await getSession();
  if (!me) return NextResponse.json({ message: 'Not signed in.' }, { status: 401 });
  if (me.role !== 'user') return NextResponse.json({ message: 'Only users have events.' }, { status: 403 });

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
  const hours = RANGES.find((r) => r.id === url.searchParams.get('range'))?.hours ?? 0;

  const [rows, total, counts] = await Promise.all([
    eventRepo.listDeletedByOwner(me.id, (page - 1) * DELETED_PAGE, DELETED_PAGE),
    eventRepo.countDeletedByOwner(me.id),
    hours ? activityRepo.countsByEvent(me.id, new Date(Date.now() - hours * 3600e3).toISOString()) : Promise.resolve(null),
  ]);

  return NextResponse.json({ rows: rows.map((e) => toRow(e, counts)), total, hasMore: page * DELETED_PAGE < total });
}
