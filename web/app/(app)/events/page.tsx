import Link from 'next/link';
import { Icon } from '@/components/ui';
import { DEFAULT_SIZE, PAGE_SIZES, RANGES, SORTS, type RangeId, type SortId } from '@/lib/ranges';
import { activityRepo } from '@/lib/server/activity';
import { downloadsOf, printsOf, toRow } from '@/lib/server/event-rows';
import { eventRepo } from '@/lib/server/events';
import { requireUser } from '@/lib/server/session';
import EventsList from './EventsList';

type Params = { range?: string; q?: string; sort?: string; size?: string; page?: string };

/**
 * The search, sort and page are in the address, so only one page of rows is built here and sent to the browser,
 * however many events there are.
 */
export default async function MyEventsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const me = await requireUser();
  const sp = await searchParams;

  const range: RangeId = RANGES.some((r) => r.id === sp.range) ? (sp.range as RangeId) : 'all';
  const sort: SortId = SORTS.some((s) => s.id === sp.sort) ? (sp.sort as SortId) : 'new';
  const size = (PAGE_SIZES as readonly number[]).includes(Number(sp.size)) ? Number(sp.size) : DEFAULT_SIZE;
  const q = (sp.q ?? '').trim().slice(0, 60);
  const hours = RANGES.find((r) => r.id === range)!.hours;

  const [live, deletedCount] = await Promise.all([eventRepo.listByOwner(me.id), eventRepo.countDeletedByOwner(me.id)]);

  // "All time" uses the events' own counters, which also cover everything before the activity log existed.
  // A time range counts from the log, one record for every download and print since it began; the database adds them up.
  const counts = hours ? await activityRepo.countsByEvent(me.id, new Date(Date.now() - hours * 3600e3).toISOString()) : null;
  const dl = (e: (typeof live)[number]) => downloadsOf(e, counts);
  const pr = (e: (typeof live)[number]) => printsOf(e, counts);

  // search, sort, then cut out the page that was asked for
  const needle = q.toLowerCase();
  const found = live.filter((e) => e.name.toLowerCase().includes(needle));
  const by: Record<SortId, (a: (typeof live)[number], b: (typeof live)[number]) => number> = {
    new: (a, b) => b.createdAt.localeCompare(a.createdAt),
    dl: (a, b) => dl(b) - dl(a) || b.createdAt.localeCompare(a.createdAt),
    pr: (a, b) => pr(b) - pr(a) || b.createdAt.localeCompare(a.createdAt),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  found.sort(by[sort]);
  const pages = Math.max(1, Math.ceil(found.length / size));
  const page = Math.min(pages, Math.max(1, parseInt(sp.page ?? '1', 10) || 1));
  const rows = found.slice((page - 1) * size, page * size).map((e) => toRow(e, counts));

  const newEvent = (
    <Link
      href="/events/new"
      className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-container px-5 text-label-lg text-white shadow-lg shadow-primary-container/30 transition hover:bg-[#b3205a]"
    >
      <Icon name="add" className="!text-[20px]" /> New Event
    </Link>
  );

  return (
    <div className="space-y-space-lg">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-lg text-[#8f1d3f] sm:text-display">My Events</h1>
          <p className="mt-1 text-body-lg text-secondary">See how many sheets were downloaded and printed for every event.</p>
        </div>
        {/* the top bar no longer has a New Event button, so this is the way to make one (the empty state below has its own) */}
        {(live.length > 0 || deletedCount > 0) && newEvent}
      </div>

      {live.length === 0 && deletedCount === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-surface-container-lowest p-10 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary-fixed text-primary">
            <Icon name="event" className="!text-[28px]" />
          </span>
          <h2 className="mt-4 text-headline-sm text-navy">No events yet</h2>
          <p className="mx-auto mt-1 max-w-sm text-body-lg text-secondary">Create your first event with just a name. You will set it up inside.</p>
          <div className="mt-5 flex justify-center">{newEvent}</div>
        </div>
      ) : (
        <EventsList
          rows={rows}
          total={found.length}
          page={page}
          pages={pages}
          size={size}
          q={q}
          sort={sort}
          range={range}
          deletedCount={deletedCount}
          summary={{
            // the bars are drawn against the biggest event in the whole list, so they mean the same on every page
            maxDownloads: Math.max(1, ...live.map(dl)),
            maxPrints: Math.max(1, ...live.map(pr)),
          }}
        />
      )}
    </div>
  );
}
