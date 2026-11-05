/** Shared by the My Events page (a server component) and its list (a client component). Kept out of the client file so the server can use the values. */

export const RANGES = [
  { id: 'all', label: 'All time', hours: 0 },
  { id: '24h', label: 'Last 24 hours', hours: 24 },
  { id: '7d', label: '7 days', hours: 24 * 7 },
  { id: '30d', label: '30 days', hours: 24 * 30 },
] as const;
export type RangeId = (typeof RANGES)[number]['id'];

export const SORTS = [
  { id: 'new', label: 'Newest first' },
  { id: 'dl', label: 'Most downloads' },
  { id: 'pr', label: 'Most prints' },
  { id: 'name', label: 'Name A–Z' },
] as const;
export type SortId = (typeof SORTS)[number]['id'];

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_SIZE = 10;
/** How many deleted events one "Load more" brings. */
export const DELETED_PAGE = 10;

export interface EventRow {
  id: string;
  name: string;
  setup: string | null; // "Round Magnet · 58 mm · 12/sheet", null while the setup is not finished
  createdIso: string;
  created: string;
  downloads: number;
  prints: number;
  lastActivity: string | null;
  deleted: string | null; // the day it was deleted, for the deleted events
}
