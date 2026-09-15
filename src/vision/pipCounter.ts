/**
 * Test images and their expected pip totals (in `test-images/`). The runner lives in
 * the vision workstream's scratchpad (`testAll.ts`, using pngjs / jpeg-js installed
 * there, never as project dependencies) and prints expected vs got for each:
 *
 *   crop1-4tiles-14-15-expect60.png   60   (0|14 1|14 0|15 1|15, touching, edge slivers)
 *   crop2-4tiles-threes-clipped-expect18.png   18   (faces clipped top and bottom)
 *   crop3-4tiles-13s-clipped-expect98.png      98   (packed pale pips, clipped)
 *   crop4-6tiles-low-expect12.png              12   (staircase, lots of bare wood)
 *   EveryDominoExample.jpg  — all 136 tiles in a triangle; row r holds tiles [c|r]
 *     for c = 0..r, so a tile's total is r + c. Blocks are cropped from it and
 *     upscaled 4x: rows1-2/cols0-1 = 8, rows3-5/cols0-2 = 45,
 *     rows8-10/cols3-5 = 117, rows13-15/cols0-2 = 135.
 *
 * Last measured: all four crops exact; the EveryDomino blocks exact except
 * rows8-10 (114-115 of 117: two touching orange pips that still look round are
 * counted as one).
 */

/**
 * Domino pip counting — pure, DOM-free image analysis.
 *
 * Approach (ported from the `pip-counter.html` prototype, with three additions
 * marked NEW for Jordan's actual double-15 set: colour-coded pips, high counts
 * packed into tight 4x4-ish grids, and pale pips on a cream face):
 *
 *  1. Face mask. For every pixel compute brightness (max channel) and saturation.
 *     A domino face is pale, near-neutral AND smooth, so we compare each pixel to
 *     the local 5x5 mean brightness (via an integral image). Wood grain and table
 *     glare fail the smoothness test even when they are bright, which is what
 *     separates a tile from a shiny table.
 *  2. Connected components of that mask. Components that are large enough, not
 *     clipped by the frame, and genuinely white (mean brightness >= whiteThreshold)
 *     are treated as tile faces.
 *  3. Oriented rectangle per face via PCA of its pixels, so a tile photographed at
 *     an angle still gets a tight box and pips near its edge stay enclosed.
 *  4. Pip search inside each oriented rect: pixels notably darker than the face (or
 *     saturated) become blobs; one erosion step breaks thin bridges to the divider
 *     bar; blobs are kept when they are big enough, small enough, roughly square
 *     and reasonably filled (a disc fills ~0.785 of its bounding box).
 *     NEW (a): the darkness margin is 28 rather than 35, because gray (12), olive
 *     (13) and light-tan (15) pips sit only ~50-70 levels below a cream face. Only
 *     *darker* pixels qualify, so a glossy highlight (brighter than the face) still
 *     cannot become a pip, and the size-outlier filter in step 5 drops specks.
 *     NEW (b): merged blobs. On 10-15 pip halves the pips almost touch and threshold
 *     into one blob that fails the roundness tests. A failed blob whose area is ~k
 *     times a single pip's (k = 2..MAX_MERGED_PIPS), and which is still about one pip
 *     thick and no more elongated than a run of k pips, is counted as k pips, with k
 *     synthetic markers spread along its long axis (a 2x2-looking cluster gets a 2x2
 *     spread) so tap-to-correct still has something to hit. "A single pip's area" is
 *     measured from the nearest few accepted pips, not the whole image: a 3-pip half
 *     has far bigger pips than a 15-pip half, so a global average mis-scales both.
 *     Detections are then de-duplicated, because the margin in step 5 makes two
 *     touching tiles each find the pips sitting near their shared edge.
 *  5. Two passes. The first pass measures a median pip diameter; the second re-runs
 *     the search with a margin of 0.7 median diameters around each tile so pips that
 *     sit on the tile edge are reached. Finally pips far off the median size (glare
 *     specks, chips) are dropped.
 *  6. NEW (c): per-tile pip colour. The set is colour-coded by number (1 light blue,
 *     2 green, 3 red, ... 12 gray, 15 light tan), so each tile reports a
 *     saturation-weighted mean hue/saturation/brightness of its pip pixels, plus the
 *     same split into the two halves of the face (pips are assigned to a half by the
 *     sign of their coordinate along the face's long axis, i.e. which side of the
 *     divider bar they fall on). Nothing here cross-checks count against colour yet;
 *     this only exposes the data.
 *
 * The caller owns rendering and any hand corrections; this module only reports what
 * it found.
 */

export interface Pip {
  x: number;
  y: number;
  r: number;
  /** Index into the returned `tiles` array, or null for a hand-placed loose pip. */
  tile: number | null;
}

/** Saturation-weighted colour summary of a set of pip pixels. */
export interface HueStat {
  /** Mean hue in degrees, 0-360 (circular mean weighted by saturation). */
  hue: number;
  /** Mean saturation, 0-255. Low means neutral pips (the gray 12s). */
  sat: number;
  /** Mean brightness, 0-255. */
  value: number;
  /** Pixels sampled; 0 means no colour information. */
  samples: number;
}

export interface Tile {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  /** Colour of every pip on this face, or null when the face has no pips. */
  dominantHue: HueStat | null;
  /** Colour per half of the face (split across the divider bar); null per empty half. */
  halves: [HueStat | null, HueStat | null];
}

/** Anything shaped like an `ImageData` — lets the analysis run under Node in tests. */
export interface ImageDataLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface AnalyzeOptions {
  /** Minimum mean brightness (0-255) for a component to count as a tile face. */
  whiteThreshold: number;
  /**
   * Ignore `whiteThreshold` and derive it from the photo: a fraction of the
   * brightest face-shaped component. Use for the first pass on a new photo, then
   * let the user's slider override it.
   */
  autoWhite?: boolean;
  /** Collect per-blob verdicts in `AnalyzeResult.debug` (for threshold tuning). */
  debug?: boolean;
}

/** Why one thresholded blob did or did not become pips. Only with `debug`. */
export interface BlobDebug {
  tileIdx: number;
  x: number;
  y: number;
  area: number;
  d: number;
  aspect: number;
  fill: number;
  majorExtent: number;
  minorExtent: number;
  /** 'pip', 'merged:<k>', or 'rejected:<reason>'. */
  verdict: string;
}

export interface AnalyzeResult {
  pips: Pip[];
  tiles: Tile[];
  /** Median pip diameter in pixels; used for hit-testing and overlay sizing. */
  medianD: number;
  /** The whiteness threshold actually used (differs from the input under `autoWhite`). */
  whiteThreshold: number;
  /** Present only when `opts.debug` is set; describes the final detection pass. */
  debug?: { blobs: BlobDebug[]; singleArea: number; singleR: number };
}

interface Component {
  id: number;
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  meanV: number;
}

interface OrientedRect {
  c: Component;
  mx: number;
  my: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

/** A thresholded dark region inside a tile, before it is judged pip / merged / junk. */
interface Blob {
  tileIdx: number;
  /** Centroid, absolute image coordinates. */
  cx: number;
  cy: number;
  /** Eroded pixel area. */
  a: number;
  /** Bounding-box diameter (+2 undoes the erosion). */
  d: number;
  aspect: number;
  fill: number;
  /** Largest plausible pip diameter on this tile. */
  maxD: number;
  /** Major axis direction and the two PCA extents (full widths). */
  ux: number;
  uy: number;
  majorExtent: number;
  minorExtent: number;
}

/** Pixel must be at least this pale to be considered part of a face. */
const FACE_MIN_V = 150;
/** ...and at most this saturated. */
const FACE_MAX_SAT = 72;
/** Local-mean radius and max deviation for the smoothness test. */
const TEX_RADIUS = 2;
const TEX_TOLERANCE = 7;
/** Minimum component area as a fraction of the whole image. */
const MIN_FACE_AREA_FRAC = 0.002;
/**
 * Maximum component area as a fraction of the whole image. Past this the "face" is
 * the photo itself (a white background, or a tile pressed against the lens).
 */
const MAX_FACE_AREA_FRAC = 0.85;
/** Auto "tile whiteness" as a fraction of the brightest candidate face. */
const AUTO_WHITE_FRACTION = 0.85;
/**
 * A pip pixel is this much darker than its face's mean brightness (prototype: 35;
 * lowered for the pale gray/olive/tan pips in the real set)...
 */
const PIP_DARKER_BY = 28;
/** ...or more saturated than this. */
const PIP_MAX_SAT = 80;
const MIN_PIP_AREA = 8;
/** A pip is never bigger than this fraction of a tile's side. */
const MAX_PIP_TILE_FRACTION = 0.4;
const MIN_PIP_ASPECT = 0.65;
const MAX_PIP_ASPECT = 1.55;
const MIN_PIP_FILL = 0.55;
/** How many nearby single pips calibrate one merged blob's expected pip size. */
const MERGE_CALIBRATION_NEIGHBOURS = 5;
/** Most pips one merged blob may be split into. */
const MAX_MERGED_PIPS = 4;
/** How far a merged blob's area may sit from an exact multiple of one pip. */
const MERGE_AREA_TOLERANCE = 0.35;
/** A merged cluster must still be between these many pip diameters thick. */
const MERGE_MIN_THICKNESS = 0.6;
/**
 * ...and no more elongated than this per pip: a run of k touching discs is about
 * 1.15k times as long as it is thick, while the divider bar is 7+ times as long as
 * it is thick, which is what keeps a bar from being "split" into pips.
 */
const MERGE_MAX_ELONGATION = 1.5;
const MERGE_MAX_THICKNESS = 2.2;
/** ...and no longer than this many pip diameters for its pip count. */
const MERGE_MAX_LENGTH_PER_PIP = 1.7;
/** Second-pass search margin, in median pip diameters. */
const EDGE_MARGIN_DIAMETERS = 0.7;
const MIN_SIZE_RATIO = 0.55;
const MAX_SIZE_RATIO = 1.7;
/**
 * Two detections closer than this many radii apart are the same physical pip. The
 * second pass searches a margin outside each face, so a pip close to where two tiles
 * touch is otherwise found once per tile.
 */
const DUPLICATE_RADII = 0.8;
/** Fraction of a pip's radius sampled when measuring its colour. */
const HUE_SAMPLE_RADIUS = 0.7;

/**
 * Default "tile whiteness". The prototype used 200; the reference photo of Jordan's
 * set (warm indoor light on a wood table) needs 185 or lower, and its dimmest tiles
 * need ~160, so the default sits lower and `WHITE_THRESHOLD_FLOOR` bounds the
 * automatic retry the UI does when a photo finds no faces at all.
 */
export const DEFAULT_WHITE_THRESHOLD = 180;
export const WHITE_THRESHOLD_FLOOR = 150;
export const WHITE_THRESHOLD_CEILING = 240;

function median(values: number[]): number {
  const s = values.slice().sort((a, b) => a - b);
  return s[s.length >> 1];
}

export function analyzeImage(
  image: ImageDataLike,
  opts: AnalyzeOptions,
): AnalyzeResult {
  const W = image.width;
  const H = image.height;
  const N = W * H;
  if (N <= 0)
    return { pips: [], tiles: [], medianD: 12, whiteThreshold: opts.whiteThreshold };

  const data = image.data;

  // ---- 1. Per-pixel brightness (max channel) and saturation ----
  const V = new Uint8Array(N);
  const Sat = new Uint8Array(N);
  for (let i = 0, j = 0; i < N; i++, j += 4) {
    const r = data[j];
    const g = data[j + 1];
    const b = data[j + 2];
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    V[i] = mx;
    Sat[i] = mx ? Math.round((255 * (mx - mn)) / mx) : 0;
  }

  // ---- Integral image of brightness, for the local 5x5 mean ----
  const S = new Float64Array((W + 1) * (H + 1));
  for (let y = 1; y <= H; y++) {
    let row = 0;
    for (let x = 1; x <= W; x++) {
      row += V[(y - 1) * W + (x - 1)];
      S[y * (W + 1) + x] = S[(y - 1) * (W + 1) + x] + row;
    }
  }

  const face = new Uint8Array(N);
  for (let y = 0; y < H; y++) {
    const y0 = Math.max(0, y - TEX_RADIUS);
    const y1 = Math.min(H, y + TEX_RADIUS + 1);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (V[i] <= FACE_MIN_V || Sat[i] >= FACE_MAX_SAT) continue; // pale and near-neutral
      const x0 = Math.max(0, x - TEX_RADIUS);
      const x1 = Math.min(W, x + TEX_RADIUS + 1);
      const mean =
        (S[y1 * (W + 1) + x1] -
          S[y0 * (W + 1) + x1] -
          S[y1 * (W + 1) + x0] +
          S[y0 * (W + 1) + x0]) /
        ((y1 - y0) * (x1 - x0));
      if (Math.abs(V[i] - mean) < TEX_TOLERANCE) face[i] = 1; // and smooth
    }
  }

  // ---- 2. Connected components of the face mask ----
  const label = new Int32Array(N);
  const stack = new Int32Array(N);
  const comps: Component[] = [];
  for (let start = 0; start < N; start++) {
    if (!face[start] || label[start]) continue;
    const id = comps.length + 1;
    let sp = 0;
    stack[sp++] = start;
    label[start] = id;
    let area = 0;
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    let sv = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p - x) / W;
      area++;
      sv += V[p];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && face[p - 1] && !label[p - 1]) {
        label[p - 1] = id;
        stack[sp++] = p - 1;
      }
      if (x < W - 1 && face[p + 1] && !label[p + 1]) {
        label[p + 1] = id;
        stack[sp++] = p + 1;
      }
      if (y > 0 && face[p - W] && !label[p - W]) {
        label[p - W] = id;
        stack[sp++] = p - W;
      }
      if (y < H - 1 && face[p + W] && !label[p + W]) {
        label[p + W] = id;
        stack[sp++] = p + W;
      }
    }
    comps.push({ id, area, minX, maxX, minY, maxY, meanV: sv / area });
  }

  // Components that are shaped like tile faces: big enough, and not the whole frame.
  // The prototype threw away anything touching the frame at all, but people do
  // photograph a hand with tiles running off the edge, so clipped faces are kept.
  // The only frame-based rejection left is a component that swallows the photo: that
  // is a white background (or a tile against the lens), where there is no table left
  // to tell tile from backdrop. Reaching all four edges is NOT by itself a rejection:
  // a tight hand of tiles pushed together does exactly that, and those photos must
  // still count.
  const candidates = comps.filter(
    (c) => c.area >= MIN_FACE_AREA_FRAC * N && c.area <= MAX_FACE_AREA_FRAC * N,
  );

  // "Tile whiteness": either the caller's number, or derived from the brightest
  // candidate, which is what makes one setting work in warm light and in cold.
  const WHITE = opts.autoWhite
    ? Math.min(
        WHITE_THRESHOLD_CEILING,
        Math.max(
          WHITE_THRESHOLD_FLOOR,
          Math.round(
            AUTO_WHITE_FRACTION * candidates.reduce((mx, c) => Math.max(mx, c.meanV), 0),
          ),
        ),
      )
    : opts.whiteThreshold;

  const faces = candidates.filter((c) => c.meanV >= WHITE);

  // ---- 3. Oriented rectangle per face (PCA of its pixels) ----
  const rects: OrientedRect[] = faces.map((c) => {
    let n = 0;
    let sx = 0;
    let sy = 0;
    for (let y = c.minY; y <= c.maxY; y++)
      for (let x = c.minX; x <= c.maxX; x++)
        if (label[y * W + x] === c.id) {
          n++;
          sx += x;
          sy += y;
        }
    const mx = sx / n;
    const my = sy / n;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    for (let y = c.minY; y <= c.maxY; y++)
      for (let x = c.minX; x <= c.maxX; x++)
        if (label[y * W + x] === c.id) {
          const dx = x - mx;
          const dy = y - my;
          sxx += dx * dx;
          syy += dy * dy;
          sxy += dx * dy;
        }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    const vx = -uy;
    const vy = ux;
    let u0 = Infinity;
    let u1 = -Infinity;
    let v0 = Infinity;
    let v1 = -Infinity;
    for (let y = c.minY; y <= c.maxY; y++)
      for (let x = c.minX; x <= c.maxX; x++)
        if (label[y * W + x] === c.id) {
          const dx = x - mx;
          const dy = y - my;
          const pu = dx * ux + dy * uy;
          const pv = dx * vx + dy * vy;
          if (pu < u0) u0 = pu;
          if (pu > u1) u1 = pu;
          if (pv < v0) v0 = pv;
          if (pv > v1) v1 = pv;
        }
    return { c, mx, my, ux, uy, vx, vy, u0, u1, v0, v1 };
  });

  // ---- 4a. Collect dark blobs inside each oriented rect ----
  // Every tile in one photo is the same physical size, so the biggest face found is
  // the best estimate of a whole tile. Sizing the "a pip cannot be bigger than this"
  // cap off each face's own area would starve a face that is clipped by the frame or
  // split in two by the divider bar, and its pips would be thrown away.
  const refArea = faces.reduce((mx, c) => Math.max(mx, c.area), 0);
  const maxD = MAX_PIP_TILE_FRACTION * Math.sqrt(refArea);

  const collectBlobs = (margin: number): Blob[] => {
    const blobs: Blob[] = [];
    rects.forEach((R, tileIdx) => {
      const c = R.c;
      const m = Math.ceil(margin);
      const bx0 = Math.max(0, c.minX - m);
      const by0 = Math.max(0, c.minY - m);
      const bx1 = Math.min(W - 1, c.maxX + m);
      const by1 = Math.min(H - 1, c.maxY + m);
      const bw = bx1 - bx0 + 1;
      const bh = by1 - by0 + 1;
      if (bw <= 0 || bh <= 0) return;
      // grid: 0 = pip-coloured pixel inside the tile rectangle, 1 = everything else
      const grid = new Uint8Array(bw * bh).fill(1);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          const gx = bx0 + x;
          const gy = by0 + y;
          const dx = gx - R.mx;
          const dy = gy - R.my;
          const pu = dx * R.ux + dy * R.uy;
          const pv = dx * R.vx + dy * R.vy;
          if (
            pu < R.u0 - margin ||
            pu > R.u1 + margin ||
            pv < R.v0 - margin ||
            pv > R.v1 + margin
          )
            continue;
          const gi = gy * W + gx;
          if (c.meanV - V[gi] > PIP_DARKER_BY || Sat[gi] > PIP_MAX_SAT)
            grid[y * bw + x] = 0;
        }
      // One step of erosion breaks thin bridges between a pip and the divider bar.
      const er = new Uint8Array(bw * bh).fill(1);
      for (let y = 1; y < bh - 1; y++)
        for (let x = 1; x < bw - 1; x++) {
          const q = y * bw + x;
          if (grid[q]) continue;
          if (
            !grid[q - 1] &&
            !grid[q + 1] &&
            !grid[q - bw] &&
            !grid[q + bw] &&
            !grid[q - bw - 1] &&
            !grid[q - bw + 1] &&
            !grid[q + bw - 1] &&
            !grid[q + bw + 1]
          )
            er[q] = 0;
        }
      const st = new Int32Array(bw * bh);
      for (let q0 = 0; q0 < bw * bh; q0++) {
        if (er[q0] !== 0) continue;
        er[q0] = 3;
        let sp = 0;
        st[sp++] = q0;
        let a = 0;
        let hx0 = bw;
        let hx1 = -1;
        let hy0 = bh;
        let hy1 = -1;
        let sx = 0;
        let sy = 0;
        let sxx = 0;
        let syy = 0;
        let sxy = 0;
        while (sp) {
          const q = st[--sp];
          const x = q % bw;
          const y = (q - x) / bw;
          a++;
          sx += x;
          sy += y;
          sxx += x * x;
          syy += y * y;
          sxy += x * y;
          if (x < hx0) hx0 = x;
          if (x > hx1) hx1 = x;
          if (y < hy0) hy0 = y;
          if (y > hy1) hy1 = y;
          if (x > 0 && er[q - 1] === 0) {
            er[q - 1] = 3;
            st[sp++] = q - 1;
          }
          if (x < bw - 1 && er[q + 1] === 0) {
            er[q + 1] = 3;
            st[sp++] = q + 1;
          }
          if (y > 0 && er[q - bw] === 0) {
            er[q - bw] = 3;
            st[sp++] = q - bw;
          }
          if (y < bh - 1 && er[q + bw] === 0) {
            er[q + bw] = 3;
            st[sp++] = q + bw;
          }
        }
        if (a < MIN_PIP_AREA) continue;
        const w2 = hx1 - hx0 + 1;
        const h2 = hy1 - hy0 + 1;
        const cx = sx / a;
        const cy = sy / a;
        // Central second moments -> principal axis and the two extents.
        const cxx = sxx / a - cx * cx;
        const cyy = syy / a - cy * cy;
        const cxy = sxy / a - cx * cy;
        const th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
        const ux = Math.cos(th);
        const uy = Math.sin(th);
        const varU = cxx * ux * ux + 2 * cxy * ux * uy + cyy * uy * uy;
        const varV = cxx * uy * uy - 2 * cxy * ux * uy + cyy * ux * ux;
        blobs.push({
          tileIdx,
          cx: bx0 + cx,
          cy: by0 + cy,
          a,
          d: Math.max(w2, h2) + 2, // +2 undoes the erosion
          aspect: w2 / h2,
          fill: a / (w2 * h2),
          maxD,
          ux,
          uy,
          // Full extent of a uniform distribution with this variance.
          majorExtent: 2 * Math.sqrt(Math.max(0, 3 * varU)),
          minorExtent: 2 * Math.sqrt(Math.max(0, 3 * varV)),
        });
      }
    });
    return blobs;
  };

  // ---- 4b. Blobs -> pips, splitting merged clusters ----
  let debugBlobs: BlobDebug[] = [];
  let debugSingleArea = 0;
  let debugSingleR = 0;
  const note = (b: Blob, verdict: string): void => {
    if (!opts.debug) return;
    debugBlobs.push({
      tileIdx: b.tileIdx,
      x: b.cx,
      y: b.cy,
      area: b.a,
      d: b.d,
      aspect: b.aspect,
      fill: b.fill,
      majorExtent: b.majorExtent,
      minorExtent: b.minorExtent,
      verdict,
    });
  };
  const findPips = (margin: number): Pip[] => {
    const blobs = collectBlobs(margin);
    debugBlobs = [];
    const single: Blob[] = [];
    const rest: Blob[] = [];
    for (const b of blobs) {
      const isPip =
        b.d <= b.maxD &&
        b.aspect >= MIN_PIP_ASPECT &&
        b.aspect <= MAX_PIP_ASPECT && // rejects the divider bar
        b.fill >= MIN_PIP_FILL; // circle ~ 0.785
      (isPip ? single : rest).push(b);
    }
    const out: Pip[] = single.map((b) => ({
      x: b.cx,
      y: b.cy,
      r: b.d / 2,
      tile: b.tileIdx,
    }));
    for (const b of single) note(b, 'pip');
    if (!single.length) {
      for (const b of rest) note(b, 'rejected:no-calibration');
      return out; // nothing to calibrate a merged blob against
    }

    debugSingleArea = median(single.map((b) => b.a));
    debugSingleR = median(single.map((b) => b.d / 2));

    // Pip size varies a lot within one photo — a 3-pip half has much bigger pips
    // than a 15-pip half — so calibrate each merged candidate against the single
    // pips nearest to it rather than against the whole image.
    const nearestSingles = (b: Blob): Blob[] =>
      single
        .slice()
        .sort(
          (p, q) =>
            Math.hypot(p.cx - b.cx, p.cy - b.cy) - Math.hypot(q.cx - b.cx, q.cy - b.cy),
        )
        .slice(0, MERGE_CALIBRATION_NEIGHBOURS);

    for (const b of rest) {
      const near = nearestSingles(b);
      const singleArea = median(near.map((n) => n.a));
      const singleR = median(near.map((n) => n.d / 2));
      const singleD = singleR * 2;
      const ratio = b.a / singleArea;
      const k = Math.round(ratio);
      if (k < 2 || k > MAX_MERGED_PIPS) {
        note(b, `rejected:k=${k}(ratio ${ratio.toFixed(2)})`);
        continue;
      }
      if (Math.abs(ratio - k) > MERGE_AREA_TOLERANCE) {
        note(b, `rejected:area-off(ratio ${ratio.toFixed(2)})`);
        continue;
      }
      // A run of touching pips is still about one pip thick and no longer than k
      // pips; this is what keeps the divider bar and the tan ring around a tile out.
      if (
        b.minorExtent < MERGE_MIN_THICKNESS * singleD ||
        b.minorExtent > MERGE_MAX_THICKNESS * singleD
      ) {
        note(b, `rejected:thickness(${(b.minorExtent / singleD).toFixed(2)} pips)`);
        continue;
      }
      if (b.majorExtent > k * MERGE_MAX_LENGTH_PER_PIP * singleD) {
        note(b, `rejected:too-long(${(b.majorExtent / singleD).toFixed(2)} pips for k=${k})`);
        continue;
      }
      if (b.majorExtent > k * MERGE_MAX_ELONGATION * b.minorExtent) {
        note(
          b,
          `rejected:too-thin(${(b.majorExtent / Math.max(1, b.minorExtent)).toFixed(1)}:1 for k=${k})`,
        );
        continue;
      }
      if (b.d > b.maxD * 1.8) {
        note(b, 'rejected:bigger-than-tile');
        continue;
      }
      note(b, `merged:${k}`);

      const vx = -b.uy;
      const vy = b.ux;
      if (k === 4 && b.majorExtent < 1.4 * b.minorExtent) {
        // Looks like a 2x2 clump rather than a line: spread on both axes.
        for (const su of [-0.25, 0.25])
          for (const sv of [-0.25, 0.25])
            out.push({
              x: b.cx + su * b.majorExtent * b.ux + sv * b.minorExtent * vx,
              y: b.cy + su * b.majorExtent * b.uy + sv * b.minorExtent * vy,
              r: singleR,
              tile: b.tileIdx,
            });
      } else {
        const len = Math.max(b.majorExtent, singleD * k * 0.8);
        for (let i = 0; i < k; i++) {
          const t = (-0.5 + (2 * i + 1) / (2 * k)) * len;
          out.push({
            x: b.cx + t * b.ux,
            y: b.cy + t * b.uy,
            r: singleR,
            tile: b.tileIdx,
          });
        }
      }
    }
    return dedupe(out);
  };

  // ---- 5. Two passes, then the size-outlier filter ----
  const tiles: Tile[] = faces.map((c) => ({
    minX: c.minX,
    minY: c.minY,
    maxX: c.maxX,
    maxY: c.maxY,
    dominantHue: null,
    halves: [null, null] as [HueStat | null, HueStat | null],
  }));

  let pips = findPips(0);
  if (pips.length >= 3) {
    const md = median(pips.map((p) => p.r * 2));
    const grow = md * EDGE_MARGIN_DIAMETERS;
    pips = findPips(grow); // second pass reaches pips on the tile edge
    for (const t of tiles) {
      t.minX = Math.max(0, t.minX - grow);
      t.minY = Math.max(0, t.minY - grow);
      t.maxX = Math.min(W - 1, t.maxX + grow);
      t.maxY = Math.min(H - 1, t.maxY + grow);
    }
  }

  // Pips across the photo are about one size; drop outliers (glare specks, chips).
  let medianD = 12;
  if (pips.length >= 3) {
    medianD = median(pips.map((p) => p.r * 2));
    pips = pips.filter(
      (p) => p.r * 2 > medianD * MIN_SIZE_RATIO && p.r * 2 < medianD * MAX_SIZE_RATIO,
    );
  } else if (pips.length) {
    medianD = pips[0].r * 2;
  }

  // ---- 6. Per-tile (and per-half) pip colour ----
  measureTileColours(tiles, pips, rects, faces, data, V, Sat, W, H);

  if (opts.debug) {
    return {
      pips,
      tiles,
      medianD,
      whiteThreshold: WHITE,
      debug: { blobs: debugBlobs, singleArea: debugSingleArea, singleR: debugSingleR },
    };
  }
  return { pips, tiles, medianD, whiteThreshold: WHITE };
}

/**
 * Drops repeat detections of the same pip (the overlapping search margins of two
 * touching tiles). Keeps the first of each cluster, so the result stays deterministic.
 */
function dedupe(pips: Pip[]): Pip[] {
  const kept: Pip[] = [];
  for (const p of pips) {
    let dup = false;
    for (const q of kept) {
      const lim = DUPLICATE_RADII * Math.min(p.r, q.r);
      if (Math.abs(p.x - q.x) < lim && Math.hypot(p.x - q.x, p.y - q.y) < lim) {
        dup = true;
        break;
      }
    }
    if (!dup) kept.push(p);
  }
  return kept;
}

/** Running saturation-weighted circular mean of hue, plus mean sat/value. */
interface HueAccumulator {
  sin: number;
  cos: number;
  sat: number;
  value: number;
  n: number;
}

function newAcc(): HueAccumulator {
  return { sin: 0, cos: 0, sat: 0, value: 0, n: 0 };
}

function finishAcc(acc: HueAccumulator): HueStat | null {
  if (!acc.n) return null;
  let hue = (Math.atan2(acc.sin, acc.cos) * 180) / Math.PI;
  if (hue < 0) hue += 360;
  return {
    hue,
    sat: acc.sat / acc.n,
    value: acc.value / acc.n,
    samples: acc.n,
  };
}

function addPixel(
  acc: HueAccumulator,
  r: number,
  g: number,
  b: number,
  v: number,
  s: number,
): void {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const c = mx - mn;
  let h = 0;
  if (c > 0) {
    if (mx === r) h = ((g - b) / c) % 6;
    else if (mx === g) h = (b - r) / c + 2;
    else h = (r - g) / c + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const rad = (h * Math.PI) / 180;
  acc.sin += s * Math.sin(rad);
  acc.cos += s * Math.cos(rad);
  acc.sat += s;
  acc.value += v;
  acc.n++;
}

/**
 * Samples the pixels inside each detected pip and folds them into the owning tile's
 * colour summary, and into one of the tile's two halves (which side of the divider
 * bar the pip sits on, by the sign of its coordinate along the face's long axis).
 */
function measureTileColours(
  tiles: Tile[],
  pips: readonly Pip[],
  rects: readonly OrientedRect[],
  faces: readonly Component[],
  data: Uint8ClampedArray,
  V: Uint8Array,
  Sat: Uint8Array,
  W: number,
  H: number,
): void {
  if (!tiles.length) return;
  const whole = tiles.map(() => newAcc());
  const halves = tiles.map(() => [newAcc(), newAcc()]);

  for (const p of pips) {
    const ti = p.tile;
    if (ti == null || ti < 0 || ti >= tiles.length) continue;
    const R = rects[ti];
    const faceV = faces[ti].meanV;
    const pu = (p.x - R.mx) * R.ux + (p.y - R.my) * R.uy;
    const half = pu < 0 ? 0 : 1;
    const rad = Math.max(1, p.r * HUE_SAMPLE_RADIUS);
    const x0 = Math.max(0, Math.floor(p.x - rad));
    const x1 = Math.min(W - 1, Math.ceil(p.x + rad));
    const y0 = Math.max(0, Math.floor(p.y - rad));
    const y1 = Math.min(H - 1, Math.ceil(p.y + rad));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const dx = x - p.x;
        const dy = y - p.y;
        if (dx * dx + dy * dy > rad * rad) continue;
        const i = y * W + x;
        if (!(faceV - V[i] > PIP_DARKER_BY || Sat[i] > PIP_MAX_SAT)) continue;
        const j = i * 4;
        const r = data[j];
        const g = data[j + 1];
        const b = data[j + 2];
        addPixel(whole[ti], r, g, b, V[i], Sat[i]);
        addPixel(halves[ti][half], r, g, b, V[i], Sat[i]);
      }
  }

  tiles.forEach((t, i) => {
    t.dominantHue = finishAcc(whole[i]);
    t.halves = [finishAcc(halves[i][0]), finishAcc(halves[i][1])];
  });
}

/** Per-tile pip counts for a set of pips (loose pips are excluded). */
export function tileCounts(pips: readonly Pip[], tileCount: number): number[] {
  const counts = new Array<number>(tileCount).fill(0);
  for (const p of pips) {
    if (p.tile != null && p.tile >= 0 && p.tile < tileCount) counts[p.tile]++;
  }
  return counts;
}

/** Decoded photo, already sized for analysis. */
export interface LoadedImage {
  /** Full-resolution decoded source; draw it at `width` x `height`. */
  source: CanvasImageSource;
  /** Target width after clamping to `maxDim`. */
  width: number;
  /** Target height after clamping to `maxDim`. */
  height: number;
  /** Frees the underlying ImageBitmap, if any. Safe to call more than once. */
  release: () => void;
}

/**
 * Decode a picked file into something drawable, with the prototype's fallback chain:
 * `createImageBitmap` first, then FileReader -> data URL -> `Image`. Throws an Error
 * with a user-facing message (including the HEIC hint) when both routes fail.
 * DOM-dependent, unlike the rest of this module.
 */
export async function loadImageToCanvasSize(
  file: File,
  maxDim: number,
): Promise<LoadedImage> {
  let source: CanvasImageSource;
  let w: number;
  let h: number;
  let release = () => {};

  try {
    const bmp = await createImageBitmap(file);
    source = bmp;
    w = bmp.width;
    h = bmp.height;
    release = () => bmp.close();
  } catch (e1) {
    try {
      const dataUrl = await new Promise<string>((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(String(r.result));
        r.onerror = () => rej(r.error ?? new Error('read failed'));
        r.readAsDataURL(file);
      });
      const im = await new Promise<HTMLImageElement>((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('img decode failed'));
        i.src = dataUrl;
      });
      source = im;
      w = im.naturalWidth;
      h = im.naturalHeight;
    } catch (e2) {
      const m1 = e1 instanceof Error ? e1.message : String(e1);
      const m2 = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(
        `Could not decode this photo (${file.type || 'unknown type'}). ` +
          'If it is HEIC, set Settings → Camera → Formats to "Most Compatible" ' +
          `and reshoot. [${m1}; ${m2}]`,
      );
    }
  }

  const scale = Math.min(1, maxDim / Math.max(w, h));
  return {
    source,
    width: Math.round(w * scale),
    height: Math.round(h * scale),
    release,
  };
}
