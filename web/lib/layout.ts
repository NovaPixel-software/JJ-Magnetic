import type { Paper, Template } from './catalog';

export const DPI = 300;
export const PX_PER_MM = DPI / 25.4;
/** Default safe margin around the sheet that the printer cannot reach. */
export const MARGIN_MM = 10;
/** Default gap between pieces, left for the die-cut. */
export const GAP_MM = 4;

export type Orientation = 'portrait' | 'landscape';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SheetLayout {
  pageW: number; // mm
  pageH: number; // mm
  cols: number;
  rows: number;
  count: number;
  /** The photo area of each piece, mm, row by row. */
  slots: Rect[];
  /** The outer cut outline of each piece, in the same order. Null when the template has no separate cut size. */
  cuts: Rect[] | null;
  /** True when not even a faint outline is drawn around the photos. */
  plain?: boolean;
  slotW: number; // photo area
  slotH: number;
  pxW: number; // pixels at 300 DPI
  pxH: number;
}

export function pageSize(paper: Paper, orientation: Orientation) {
  return orientation === 'portrait' ? { w: paper.wmm, h: paper.hmm } : { w: paper.hmm, h: paper.wmm };
}

type Spec = Pick<Template, 'wmm' | 'hmm'> & Partial<Pick<Template, 'cutW' | 'cutH' | 'gapXmm' | 'gapYmm' | 'topMm' | 'marginMm' | 'plain'>>;

export function computeLayout(paper: Paper, orientation: Orientation, template: Spec): SheetLayout {
  const { w: pageW, h: pageH } = pageSize(paper, orientation);
  const margin = template.marginMm ?? MARGIN_MM;
  const gapX = template.gapXmm ?? GAP_MM;
  const gapY = template.gapYmm ?? GAP_MM;
  // Pieces are packed by their outer size: the cut outline when there is one, otherwise the photo itself.
  const cellW = template.cutW ?? template.wmm;
  const cellH = template.cutH ?? template.hmm;
  const fit = (avail: number, size: number, gap: number) => Math.max(0, Math.floor((avail + gap) / (size + gap) + 1e-9));
  const cols = fit(pageW - 2 * margin, cellW, gapX);
  // with a fixed top margin the rows start there and only the bottom margin is shared out; otherwise they are centred
  let rows = fit(template.topMm != null ? pageH - template.topMm - margin : pageH - 2 * margin, cellH, gapY);
  // A paper that caps the count (9 per sheet) drops whole rows, and the block is then centred on the sheet.
  const capped = !!paper.maxCount && cols > 0 && cols * rows > paper.maxCount;
  if (capped) rows = Math.max(1, Math.floor(paper.maxCount! / cols));
  const totalW = cols * cellW + Math.max(0, cols - 1) * gapX;
  const totalH = rows * cellH + Math.max(0, rows - 1) * gapY;
  const x0 = (pageW - totalW) / 2;
  const y0 = capped ? (pageH - totalH) / 2 : (template.topMm ?? (pageH - totalH) / 2);
  const slots: Rect[] = [];
  const cuts: Rect[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = x0 + c * (cellW + gapX);
      const y = y0 + r * (cellH + gapY);
      cuts.push({ x, y, w: cellW, h: cellH });
      // the photo area sits in the middle of its cut outline
      slots.push({ x: x + (cellW - template.wmm) / 2, y: y + (cellH - template.hmm) / 2, w: template.wmm, h: template.hmm });
    }
  }
  return {
    pageW,
    pageH,
    cols,
    rows,
    count: cols * rows,
    slots,
    cuts: template.cutW && template.cutH ? cuts : null,
    plain: template.plain,
    slotW: template.wmm,
    slotH: template.hmm,
    pxW: Math.round(pageW * PX_PER_MM),
    pxH: Math.round(pageH * PX_PER_MM),
  };
}

/** How many slots fit if the template were turned 90 degrees, to say whether the chosen yield is the best one. */
export function rotatedYield(paper: Paper, orientation: Orientation, template: Spec): number {
  return computeLayout(paper, orientation, { ...template, wmm: template.hmm, hmm: template.wmm, cutW: template.cutH, cutH: template.cutW }).count;
}
