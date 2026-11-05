/* Products, shapes, template sizes and paper sizes. Pure data, so it can move to a DB table later. */

export type ClipKind = 'rect' | 'rounded' | 'ellipse';

export interface Shape {
  id: string;
  label: string;
  icon: string; // Material Symbols name
  clip: ClipKind;
}

export interface Product {
  id: string;
  label: string;
}

export interface Template {
  id: string;
  productId: string;
  shapeId: string;
  wmm: number;
  hmm: number;
  label: string; // e.g. 3.1 × 2.1 in (80×53 mm)
  /**
   * Optional. The outer cut size in mm. When set, wmm and hmm are the photo area, centred inside the cut
   * outline, and every piece on the sheet gets a cut outline drawn around it. The space between the photo
   * edge and the cut line is the same on every side.
   */
  cutW?: number;
  cutH?: number;
  /**
   * Optional spacing overrides in mm. Defaults are a 10 mm printer-safe margin and a 4 mm gap.
   * gapXmm is between pieces across, gapYmm between rows, topMm the space above the first row.
   */
  gapXmm?: number;
  gapYmm?: number;
  topMm?: number;
  marginMm?: number;
  /** No cut outline of any kind, not even the faint alignment line: the pieces are cut by hand or by machine from the photos alone. */
  plain?: boolean;
}

export interface Paper {
  id: string;
  label: string;
  wmm: number;
  hmm: number;
  /** Most pieces to put on the sheet. Fewer than would fit leaves more room around each piece. */
  maxCount?: number;
}

/** Every event is a magnet. The setup form has no product choice, so new events are saved with this one. */
export const DEFAULT_PRODUCT_ID = 'magnet';
export const PRODUCTS: Product[] = [{ id: DEFAULT_PRODUCT_ID, label: 'Magnet' }];

/** Products that earlier events were saved with. They are not offered any more, but those events still open. */
const LEGACY_PRODUCTS: Product[] = [
  { id: 'round-magnet', label: 'Round Magnet' },
  { id: 'square-magnet', label: 'Square Magnet' },
  { id: 'acrylic', label: 'Acrylic Magnet' },
  { id: 'print', label: 'Photo Print' },
  { id: 'badge', label: 'Badge / Pin' },
  { id: 'keychain', label: 'Keychain' },
  { id: 'sticker', label: 'Sticker' },
];

// Every shape, including the ones only old events use. The Photo Shape dropdown shows OFFERED_SHAPE_IDS, in that order.
export const SHAPES: Shape[] = [
  { id: 'round', label: 'Round 2 inch', icon: 'circle', clip: 'ellipse' },
  { id: 'square', label: 'Square 2 inch', icon: 'crop_square', clip: 'rect' },
  { id: 'rect-landscape', label: 'Rectangle 3.5 × 2.1 inches', icon: 'crop_landscape', clip: 'rect' },
  { id: 'rect-portrait', label: 'Rectangle Portrait (2:3)', icon: 'crop_portrait', clip: 'rect' },
  { id: 'oval', label: 'Oval', icon: 'egg', clip: 'ellipse' },
  { id: 'rounded', label: 'Rounded Rectangle', icon: 'rounded_corner', clip: 'rounded' },
];

const mmToIn = (mm: number) => (mm / 25.4).toFixed(1).replace(/\.0$/, '');
const dim = (w: number, h: number) =>
  w === h ? `${mmToIn(w)} in (${w} mm)` : `${mmToIn(w)} × ${mmToIn(h)} in (${w}×${h} mm)`;

function t(productId: string, shapeId: string, wmm: number, hmm = wmm): Template {
  return { id: `${productId}-${shapeId}-${wmm}x${hmm}`, productId, shapeId, wmm, hmm, label: dim(wmm, hmm) };
}

/**
 * Printing templates measured from the two PSD files (58 MM ROUND 12 PIECES, SQUARE FRIDGE MAGNET; A4, 200 ppi).
 * Each piece is a photo area inside a thin cut outline. Both give 12 pieces (3 x 4) on A4.
 * The sizes come from the vector data and the pixels in the PSDs, not from the layer boxes (those include the
 * anti-aliased edge and the line width, which made them 0.3 to 0.5 mm too big). Cut sizes are the centre of the cut line.
 */
const ROUND_CUT_ID = 'magnet-round-photo60.3-outer68.3';
const SQUARE_CUT_ID = 'magnet-square-photo54.1-cut64.4';
/** Space between the photo edge and the cut outline, on every side, in mm. Measured from the two PSD files. */
const RING_ROUND_MM = 4; // Photoshop: outer circle 538 px (68.3 mm), inner circle 475 px (60.3 mm), so (68.3 - 60.3) / 2
const RING_SQUARE_MM = 5.15; // Photoshop: outer 507 px (64.4 mm), inner 426 px (54.1 mm), so (64.4 - 54.1) / 2; also used for the magnet rectangles
/** Spacing between pieces, from the PSD layer positions (200 ppi). Round pieces nearly touch across; Square has wider gaps. */
const SPACE_ROUND = { gapX: 0.44, gapY: 2.67, top: 3.7, margin: 1.5 };
const SPACE_SQUARE = { gapX: 5.59, gapY: 4.53, top: 2.5, margin: 1.5 };

const round2 = (n: number) => Math.round(n * 100) / 100;

function cutTemplate(id: string, shapeId: string, photoW: number, photoH: number, ringMm: number, space: { gapX: number; gapY: number; top: number; margin: number }, label?: string): Template {
  const cutW = round2(photoW + 2 * ringMm);
  const cutH = round2(photoH + 2 * ringMm);
  return {
    id,
    productId: 'magnet',
    shapeId,
    wmm: photoW,
    hmm: photoH,
    cutW,
    cutH,
    gapXmm: space.gapX,
    gapYmm: space.gapY,
    topMm: space.top,
    marginMm: space.margin,
    label: label ?? `${dim(photoW, photoH)} · cut ${cutW}×${cutH} mm`,
  };
}

/** A magnet rectangle: no cut outline, just the photos with the same gaps as between the cut outlines of the Square sheet. */
const magnetRect = (shapeId: string, w: number, h: number): Template => ({
  id: `magnet-${shapeId}-${w}x${h}`,
  productId: 'magnet',
  shapeId,
  wmm: w,
  hmm: h,
  gapXmm: SPACE_SQUARE.gapX,
  gapYmm: SPACE_SQUARE.gapY,
  topMm: SPACE_SQUARE.top,
  marginMm: SPACE_SQUARE.margin,
  plain: true,
  label: dim(w, h),
});

/** Events saved before these templates existed point at the old ids, which now map to the new ones. */
const LEGACY_TEMPLATE_IDS: Record<string, string> = {
  'magnet-square-photo53.6-cut64': SQUARE_CUT_ID,
  'magnet-round-photo59-cut68': ROUND_CUT_ID,
  'magnet-round-photo59-outer59.9': ROUND_CUT_ID,
  'magnet-round-photo59.4-cut68.3': ROUND_CUT_ID,
  'magnet-round-58x58': ROUND_CUT_ID,
  'magnet-square-63.5x63.5': SQUARE_CUT_ID,
};

export const TEMPLATES: Template[] = [
  // Fridge magnets: round first, then square
  cutTemplate(ROUND_CUT_ID, 'round', 60.3, 60.3, RING_ROUND_MM, SPACE_ROUND, '58 mm round · inner 60.3 mm · outer 68.3 mm'),
  cutTemplate('magnet-round-50x50', 'round', 50, 50, RING_ROUND_MM, SPACE_ROUND),
  cutTemplate(SQUARE_CUT_ID, 'square', 54.1, 54.1, RING_SQUARE_MM, SPACE_SQUARE, 'Square · photo 54.1 mm · cut 64.4 mm'),
  cutTemplate('magnet-square-50x50', 'square', 50, 50, RING_SQUARE_MM, SPACE_SQUARE),
  magnetRect('rect-landscape', 80, 53),
  magnetRect('rect-landscape', 89, 51),
  magnetRect('rect-landscape', 88.9, 63.5), // 3.5 x 2.5 inch
  magnetRect('rect-landscape', 63.5, 88.9), // 2.5 x 3.5 inch
  magnetRect('rect-landscape', 114.3, 88.9), // 4.5 x 3.5 inch
  magnetRect('rect-portrait', 53, 80),
  magnetRect('rect-portrait', 63.5, 88.9), // 2.5 x 3.5 inch
  cutTemplate('magnet-round-37x37', 'round', 37, 37, RING_ROUND_MM, SPACE_ROUND),
  t('magnet', 'oval', 76, 51),
  t('magnet', 'rounded', 80, 53),
  // Photo prints
  t('print', 'rect-landscape', 152, 102),
  t('print', 'rect-landscape', 178, 127),
  t('print', 'rect-portrait', 102, 152),
  t('print', 'rect-portrait', 127, 178),
  t('print', 'square', 102),
  t('print', 'square', 127),
  // Badges / pins
  t('badge', 'round', 58),
  t('badge', 'round', 44),
  t('badge', 'round', 37),
  t('badge', 'square', 50),
  // Keychains
  t('keychain', 'rect-landscape', 45, 30),
  t('keychain', 'rounded', 50, 35),
  t('keychain', 'round', 40),
  // Stickers
  t('sticker', 'round', 50),
  t('sticker', 'round', 76),
  t('sticker', 'square', 50),
  t('sticker', 'square', 76),
  t('sticker', 'rounded', 76, 51),
];

const A4_LABEL = 'A4 (210 × 297 mm)';
const A4: Paper = { id: 'a4', label: A4_LABEL, wmm: 210, hmm: 297 };
/** The same A4 sheet with at most 9 pieces on it (3 across, 3 down), for a wider space between them. */
const A4_NINE: Paper = { id: 'a4-9', label: A4_LABEL, wmm: 210, hmm: 297, maxCount: 9 };

/** Papers that earlier events were saved with. Only A4 is offered now, the rest are kept so old events still open. */
const LEGACY_PAPERS: Paper[] = [
  { id: 'a6', label: 'A6 (105 × 148 mm)', wmm: 105, hmm: 148 },
  { id: 'a5', label: 'A5 (148 × 210 mm)', wmm: 148, hmm: 210 },
  { id: 'a3', label: 'A3 (297 × 420 mm)', wmm: 297, hmm: 420 },
  { id: '4x6', label: '4 × 6 in photo paper (102 × 152 mm)', wmm: 102, hmm: 152 },
  { id: '5x7', label: '5 × 7 in photo paper (127 × 178 mm)', wmm: 127, hmm: 178 },
  { id: '13x19', label: '13 × 19 in (330 × 483 mm)', wmm: 330, hmm: 483 },
];

/** The shapes the Photo Shape dropdown offers, in order. */
export const OFFERED_SHAPE_IDS = ['round', 'square', 'rect-landscape'];

/** The template sizes offered for each shape: round 58 mm, square 50 mm, and two rectangles. */
const OFFERED_TEMPLATE_IDS = [ROUND_CUT_ID, 'magnet-square-50x50', 'magnet-rect-landscape-63.5x88.9', 'magnet-rect-landscape-114.3x88.9'];

export const getProduct = (id: string) => PRODUCTS.find((p) => p.id === id) ?? LEGACY_PRODUCTS.find((p) => p.id === id);
export const getShape = (id: string) => SHAPES.find((s) => s.id === id);
export const getTemplate = (id: string) => TEMPLATES.find((x) => x.id === (LEGACY_TEMPLATE_IDS[id] ?? id));

/** Short size text for lists: "59 mm photo · 68 mm cut" for cut templates, otherwise the piece size. */
export function sizeText(t: Template): string {
  const piece = t.wmm === t.hmm ? `${t.wmm} mm` : `${t.wmm}×${t.hmm} mm`;
  return t.cutW && t.cutH ? `${piece} photo · ${cutText(t)} cut` : piece;
}

/** The cut outline size, like "68 mm" or "90.4×63.4 mm". Empty when the template has no cut outline. */
export function cutText(t: Template): string {
  if (!t.cutW || !t.cutH) return '';
  return t.cutW === t.cutH ? `${t.cutW} mm` : `${t.cutW}×${t.cutH} mm`;
}
export const getPaper = (id: string) => [A4, A4_NINE, ...LEGACY_PAPERS].find((p) => p.id === id);

/** The shapes to offer. The same three for every product. */
export const offeredShapes = () => OFFERED_SHAPE_IDS.map((id) => getShape(id)!);

/** The sizes to offer for a shape. */
export const templatesForShape = (shapeId: string) => OFFERED_TEMPLATE_IDS.map((id) => getTemplate(id)!).filter((x) => x.shapeId === shapeId);

/** The paper choices: always A4. Round can have 12 or 9 pieces on it, square and rectangles just the most that fit. */
export const paperOptionsFor = (shapeId: string): Paper[] => (shapeId === 'round' ? [A4, A4_NINE] : [A4]);
