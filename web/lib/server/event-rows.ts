import { sizeText } from '@/lib/catalog';
import { resolveSetup } from '@/lib/event';
import type { EventRow } from '@/lib/ranges';
import type { EventRecord } from './events';

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

/** One event as a row of the My Events table. */
export function toRow(e: EventRecord): EventRow {
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
    downloads: e.downloads,
    prints: e.prints,
    lastActivity: fmtDate(e.lastActivityAt),
  };
}
