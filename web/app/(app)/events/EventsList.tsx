'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import Dropdown from '@/components/Dropdown';
import { Icon, Spinner } from '@/components/ui';
import { DEFAULT_SIZE, PAGE_SIZES, RANGES, SORTS, type EventRow, type RangeId, type SortId } from '@/lib/ranges';

/** What the bars are drawn against: the biggest event in the whole list, so they mean the same on every page. */
export interface Summary {
  maxDownloads: number;
  maxPrints: number;
}

interface Props {
  rows: EventRow[]; // only the page being shown
  total: number; // events that match the search, over all pages
  page: number;
  pages: number;
  size: number;
  q: string;
  sort: SortId;
  range: RangeId;
  deletedCount: number;
  summary: Summary;
}

const NotFinished = () => (
  <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-label-md text-amber-900">
    <Icon name="pending" className="!text-[14px]" /> Setup not finished
  </span>
);

export default function EventsList({ rows: initial, total, page, pages, size, q, sort, range, deletedCount, summary }: Props) {
  const router = useRouter();
  const [loading, startTransition] = useTransition(); // true while the server is making the next page
  const [text, setText] = useState(q);
  const [rows, setRows] = useState(initial);

  // The server sends new rows for a new page, search or sort, so take them.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setRows(initial);
  }

  /** The address for this page with some of the choices changed. Search, sort, size and range start again from page 1. */
  const href = (patch: Partial<{ range: RangeId; q: string; sort: SortId; size: number; page: number }>) => {
    const next = { range, q, sort, size, page: 1, ...patch };
    const p = new URLSearchParams();
    if (next.range !== 'all') p.set('range', next.range);
    if (next.q) p.set('q', next.q);
    if (next.sort !== 'new') p.set('sort', next.sort);
    if (next.size !== DEFAULT_SIZE) p.set('size', String(next.size));
    if (next.page > 1) p.set('page', String(next.page));
    const s = p.toString();
    return s ? `/events?${s}` : '/events';
  };
  const go = (patch: Parameters<typeof href>[0], replace = false) =>
    startTransition(() => (replace ? router.replace(href(patch), { scroll: false }) : router.push(href(patch), { scroll: false })));

  // Typing in the search box waits a moment for the next key before asking the server.
  useEffect(() => {
    if (text.trim() === q) return;
    const t = setTimeout(() => go({ q: text.trim() }, true), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const from = total === 0 ? 0 : (page - 1) * size + 1;
  const to = Math.min(total, page * size);

  return (
    <div className="space-y-space-lg">
      {/* time range, search, sort */}
      <div className="space-y-space-sm">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <Link
              key={r.id}
              href={href({ range: r.id })}
              scroll={false}
              aria-current={range === r.id}
              className={`rounded-full border px-3.5 py-1.5 text-label-lg transition ${range === r.id ? 'border-primary-container bg-primary-container text-white shadow' : 'border-surface-container-high bg-white text-secondary hover:border-primary-container/50 hover:text-navy'}`}
            >
              {r.label}
            </Link>
          ))}
        </div>
        {range !== 'all' && (
          <p className="flex items-start gap-1.5 text-body-sm text-secondary">
            <Icon name="info" className="!text-[16px]" /> Time ranges count the downloads and prints made after this feature was added. "All time" has everything.
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="relative min-w-0 flex-1">
            <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-primary-container" />
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Search events…"
              className="h-11 w-full rounded-xl border border-surface-container-high bg-white pl-10 pr-10 text-body-lg outline-none transition focus:border-primary-container focus:ring-4 focus:ring-primary-container/15"
            />
            {loading && <Spinner className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary-container" />}
          </label>
          <Dropdown value={sort} onChange={(v) => go({ sort: v })} label="Sort" options={SORTS.map((s) => ({ value: s.id, label: s.label }))} className="w-[9.5rem] shrink-0 sm:w-52" />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-outline-variant bg-white p-8 text-center text-body-lg text-secondary">
          {q ? `No event matches "${q}".` : 'No events in your list.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white bg-white shadow-sm" aria-busy={loading}>
          {/* a thin bar runs across the top while the next page loads */}
          <div className={`h-1 overflow-hidden bg-surface-container ${loading ? '' : 'invisible'}`}>
            <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#ec5b84] to-[#d6336c]" />
          </div>
          {/* The table, on every screen size. On a phone it scrolls sideways. */}
          <div className={`overflow-x-auto transition-opacity ${loading ? 'pointer-events-none opacity-50' : ''}`}>
            <table className="w-full text-left text-body-lg">
              <thead className="bg-surface-container-low text-label-md uppercase tracking-wider text-[#8f1d3f]">
                <tr>
                  {['Event', 'Setup', 'Created', 'Downloads', 'Prints'].map((h) => (
                    <th key={h} className="whitespace-nowrap px-4 py-3.5 font-bold">
                      {h}
                    </th>
                  ))}
                  <th className="w-24 px-2 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => router.push(`/events/${r.id}`)} className="cursor-pointer transition hover:bg-surface-container-low">
                    <td className="px-4 py-4">
                      <Link href={`/events/${r.id}`} onClick={(e) => e.stopPropagation()} className="text-[15px] font-bold text-navy hover:text-primary-container hover:underline">
                        {r.name}
                      </Link>
                      {r.lastActivity && <p className="text-body-sm text-secondary">Last used {r.lastActivity}</p>}
                    </td>
                    <td className="px-4 py-4">{r.setup ? <span className="whitespace-nowrap rounded-full bg-primary-fixed px-2.5 py-1 text-label-md text-[#8f1d3f]">{r.setup}</span> : <NotFinished />}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-body-lg text-secondary">{r.created}</td>
                    <td className="px-4 py-4">
                      <Metric value={r.downloads} max={summary.maxDownloads} unit="downloaded" />
                    </td>
                    <td className="px-4 py-4">
                      <Metric value={r.prints} max={summary.maxPrints} unit="printed" dark />
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right text-secondary">
                      <Icon name="chevron_right" className="align-middle" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* pages: only when there are more events than the smallest page holds */}
          {total > PAGE_SIZES[0] && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-container px-4 py-3">
            <p className="text-body-md text-secondary">
              Showing <b className="text-navy">{from}–{to}</b> of <b className="text-navy">{total}</b>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-body-md text-secondary">
                Per page
                <Dropdown value={size} onChange={(v) => go({ size: v })} label="Per page" up compact options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))} className="w-24" />
              </div>
              {pages > 1 && <Pager page={page} pages={pages} onGo={(n) => go({ page: n })} />}
            </div>
          </div>
          )}
        </div>
      )}

      {/* deleted events: gone from the list, but their numbers are still counted above and can be traced here */}
      {deletedCount > 0 && <DeletedEvents key={`${deletedCount}-${range}`} count={deletedCount} range={range} />}
    </div>
  );
}

/** Previous, the page numbers around this one, and next. */
function Pager({ page, pages, onGo }: { page: number; pages: number; onGo: (n: number) => void }) {
  const shown = new Set([1, pages, page - 1, page, page + 1]);
  const list = [...shown].filter((n) => n >= 1 && n <= pages).sort((a, b) => a - b);
  const btn = 'flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-label-lg transition disabled:opacity-40';
  return (
    <nav className="flex items-center gap-1" aria-label="Pages">
      <button className={`${btn} text-navy hover:bg-surface-container`} disabled={page <= 1} onClick={() => onGo(page - 1)} aria-label="Previous page">
        <Icon name="chevron_left" />
      </button>
      {list.map((n, i) => (
        <span key={n} className="flex items-center gap-1">
          {i > 0 && n - list[i - 1] > 1 && <span className="px-1 text-secondary">…</span>}
          <button
            className={`${btn} ${n === page ? 'bg-primary-container text-white shadow' : 'text-navy hover:bg-surface-container'}`}
            aria-current={n === page ? 'page' : undefined}
            onClick={() => n !== page && onGo(n)}
          >
            {n}
          </button>
        </span>
      ))}
      <button className={`${btn} text-navy hover:bg-surface-container`} disabled={page >= pages} onClick={() => onGo(page + 1)} aria-label="Next page">
        <Icon name="chevron_right" />
      </button>
    </nav>
  );
}

/** The deleted events. Nothing is fetched until the box is opened, and then ten at a time. */
function DeletedEvents({ count, range }: { count: number; range: RangeId }) {
  const [items, setItems] = useState<EventRow[]>([]);
  const [page, setPage] = useState(0); // pages loaded so far
  const [more, setMore] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/events/deleted?page=${page + 1}&range=${range}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { rows: EventRow[]; hasMore: boolean };
      setItems((prev) => [...prev, ...data.rows]);
      setPage((p) => p + 1);
      setMore(data.hasMore);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <details
      className="group rounded-2xl border border-surface-container-high bg-white/70"
      onToggle={(e) => {
        if ((e.currentTarget as HTMLDetailsElement).open && page === 0) void load();
      }}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3.5 text-label-lg text-navy">
        <Icon name="delete_history" className="text-primary-container" />
        Deleted events ({count})
        <span className="ml-auto hidden text-body-sm font-normal text-secondary sm:inline">Their downloads and prints are kept here</span>
        <Icon name="expand_more" className="transition group-open:rotate-180" />
      </summary>
      <div className="border-t border-surface-container-high">
        {items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-md">
              <thead className="text-label-md text-secondary">
                <tr>
                  {['Event', 'Setup', 'Deleted', 'Downloads', 'Prints'].map((h, i) => (
                    <th key={h} className={`px-4 py-2.5 font-semibold ${i >= 3 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {items.map((r) => (
                  <tr key={r.id} className="text-secondary">
                    <td className="px-4 py-2.5 font-semibold text-navy">{r.name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{r.setup ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-2.5">{r.deleted}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-navy">{r.downloads}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-navy">{r.prints}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-col items-center gap-2 px-4 py-3">
          {busy && (
            <p className="flex items-center gap-2 text-body-md text-secondary">
              <Spinner className="h-4 w-4 text-primary-container" /> Loading…
            </p>
          )}
          {failed && <p className="text-body-md text-error">Could not load. Check your connection.</p>}
          {!busy && (failed || (more && page > 0)) && (
            <button onClick={() => void load()} className="h-9 rounded-lg bg-surface-container px-4 text-label-lg text-navy hover:bg-surface-container-high">
              {failed ? 'Try again' : 'Load more'}
            </button>
          )}
        </div>
      </div>
    </details>
  );
}

/** A number with a bar under it, as long as the number is next to the biggest one in the list. */
function Metric({ value, max, unit, dark = false }: { value: number; max: number; unit: string; dark?: boolean }) {
  return (
    <div className="min-w-[140px]">
      <p className={`flex items-baseline gap-1.5 text-[18px] font-extrabold ${value ? 'text-navy' : 'text-secondary/50'}`}>
        {value} <span className="text-label-md font-semibold text-secondary">{unit}</span>
      </p>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-container">
        <div className={`h-full rounded-full ${dark ? 'bg-gradient-to-r from-[#c2185b] to-[#8f1d3f]' : 'bg-gradient-to-r from-[#ec5b84] to-[#d6336c]'}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
    </div>
  );
}
