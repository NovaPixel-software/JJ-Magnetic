import { sizeText } from '@/lib/catalog';
import { resolveSetup } from '@/lib/event';
import type { EventRow } from '@/lib/ranges';
import type { EventRecord } from './events';

/** Downloads and prints per event id for a time range, or null for all time (then the events' own counters are used). */
export type RangeCounts = Record<string, { downloads: number; prints: number }> | null;

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

export const downloadsOf = (e: EventRecord, c: RangeCounts) => (c ? (c[e.id]?.downloads ?? 0) : e.downloads);
export const printsOf = (e: EventRecord, c: RangeCounts) => (c ? (c[e.id]?.prints ?? 0) : e.prints);

/** One event as a row of the My Events table. */
export function toRow(e: EventRecord, c: RangeCounts): EventRow {
  let setup: string | null = null;
  if (e.setup) {
    const { template, layout } = resolveSetup(e.setup);
    setup = `${sizeText(template)} · ${layout.count}/sheet`;
  }
  return {
    id: e.id,
    name: e.name,
    setup,
    createdIso: e.createdAt,
    created: fmtDate(e.createdAt)!,
    downloads: downloadsOf(e, c),
    prints: printsOf(e, c),
    lastActivity: fmtDate(e.lastActivityAt),
    deleted: fmtDate(e.deletedAt),
  };
}
