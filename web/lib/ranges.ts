/** Shared by the My Events page (a server component) and its list (a client component). Kept out of the client file so the server can use the values. */

export const SORTS = [
  { id: 'new', label: 'Newest first' },
  { id: 'dl', label: 'Most downloads' },
  { id: 'pr', label: 'Most prints' },
  { id: 'name', label: 'Name A–Z' },
] as const;
export type SortId = (typeof SORTS)[number]['id'];

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_SIZE = 10;

export interface EventRow {
  id: string;
  name: string;
  setup: string | null; // "Round Magnet · 58 mm · 12/sheet", null while the setup is not finished
  createdIso: string;
  created: string;
  downloads: number;
  prints: number;
  lastActivity: string | null;
}
