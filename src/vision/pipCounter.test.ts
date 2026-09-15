import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { analyzeImage, tileCounts, type ImageDataLike } from './pipCounter.ts';

/**
 * Photos of Jordan's actual double-15 set, plus synthetic tiles for the cases the
 * photos do not cover. Every case runs with `autoWhite`, which is what the app does
 * with a fresh photo.
 *
 * Ground truth comes from the file names: a tile written `c|r` has c pips on its top
 * half and r on its bottom, so its total is c + r.
 */

const loadPng = (name: string): ImageDataLike => {
  const png = PNG.sync.read(
    readFileSync(new URL(`../../test-images/${name}`, import.meta.url)),
  );
  return {
    data: new Uint8ClampedArray(png.data),
    width: png.width,
    height: png.height,
  };
};

const PHOTOS = [
  {
    file: 'crop1-4tiles-14-15-expect60.png',
    tiles: '0|14 1|14 0|15 1|15',
    note: 'four packed tiles touching each other, with neighbour slivers at the edges',
    expected: 60,
  },
  {
    file: 'crop2-4tiles-threes-clipped-expect18.png',
    tiles: '0|3 1|3 2|3 3|3',
    note: 'four tiles in a row, faces clipped by the top and bottom of the frame',
    expected: 18,
  },
  {
    file: 'crop3-4tiles-13s-clipped-expect98.png',
    tiles: '10|13 11|13 12|13 13|13',
    note: 'packed orange / dark red / gray / olive pips, faces clipped by the frame',
    expected: 98,
  },
  {
    file: 'crop4-6tiles-low-expect12.png',
    tiles: '0|0 0|1 1|1 0|2 1|2 2|2',
    note: 'six tiles in a staircase on bare wood',
    expected: 12,
  },
] as const;

describe('analyzeImage on photos of the real set', () => {
  for (const photo of PHOTOS) {
    it(`counts ${photo.expected} pips on ${photo.tiles} (${photo.note})`, () => {
      const image = loadPng(photo.file);
      const res = analyzeImage(image, { whiteThreshold: 180, autoWhite: true });

      expect(res.pips.length).toBe(photo.expected);
      // autoWhite must land inside the slider's range, and find something.
      expect(res.whiteThreshold).toBeGreaterThanOrEqual(150);
      expect(res.whiteThreshold).toBeLessThanOrEqual(240);
      expect(res.tiles.length).toBeGreaterThan(0);
    });
  }
});

// ---------------------------------------------------------------------------
// Synthetic tiles: a tan table, cream faces, dark pips. Built here rather than
// committed as fixtures.
// ---------------------------------------------------------------------------

type Rgb = readonly [number, number, number];
const TABLE: Rgb = [200, 160, 120];
const FACE: Rgb = [245, 243, 236];

interface Canvas {
  image: ImageDataLike;
  rect: (x0: number, y0: number, x1: number, y1: number, c: Rgb) => Canvas;
  disc: (cx: number, cy: number, r: number, c: Rgb) => Canvas;
}

function canvas(width: number, height: number): Canvas {
  const data = new Uint8ClampedArray(width * height * 4);
  const put = (x: number, y: number, c: Rgb): void => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const j = (y * width + x) * 4;
    data[j] = c[0];
    data[j + 1] = c[1];
    data[j + 2] = c[2];
    data[j + 3] = 255;
  };
  const self: Canvas = {
    image: { data, width, height },
    rect(x0, y0, x1, y1, c) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(x, y, c);
      return self;
    },
    disc(cx, cy, r, c) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) put(x, y, c);
      return self;
    },
  };
  return self.rect(0, 0, width - 1, height - 1, TABLE);
}

describe('analyzeImage on synthetic tiles', () => {
  it('finds two separate faces and splits their pips 3 and 5', () => {
    const c = canvas(400, 300);
    c.rect(40, 40, 200, 130, FACE).rect(230, 160, 360, 250, FACE);
    const dark: Rgb = [22, 20, 20];
    for (const [x, y] of [
      [75, 60],
      [120, 85],
      [165, 110],
    ])
      c.disc(x, y, 7, dark);
    for (const [x, y] of [
      [258, 185],
      [332, 185],
      [295, 205],
      [258, 225],
      [332, 225],
    ])
      c.disc(x, y, 7, dark);

    const res = analyzeImage(c.image, { whiteThreshold: 180, autoWhite: true });

    expect(res.tiles).toHaveLength(2);
    expect(res.pips).toHaveLength(8);
    expect(res.pips.every((p) => p.tile !== null)).toBe(true);
    expect(tileCounts(res.pips, res.tiles.length).sort((a, b) => a - b)).toEqual([3, 5]);
  });

  it('counts a packed 15-pip half and a pale 12-pip half, and reads their colours', () => {
    // The hard real-world shape: a 4x4-minus-one grid of light tan 15s beside a
    // 4x3 grid of gray 12s, 2px apart, either side of a black divider bar.
    const c = canvas(700, 400);
    c.rect(60, 80, 640, 320, FACE).rect(345, 95, 355, 305, [22, 20, 20]);
    const TAN: Rgb = [190, 160, 120];
    const GRAY: Rgb = [170, 170, 170];
    const r = 20;
    const step = 2 * r + 2;
    let tan = 0;
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 4; col++) {
        if (tan === 15) break;
        c.disc(202.5 + (col - 1.5) * step, 200 + (row - 1.5) * step, r, TAN);
        tan++;
      }
    for (let row = 0; row < 3; row++)
      for (let col = 0; col < 4; col++)
        c.disc(497.5 + (col - 1.5) * step, 200 + (row - 1) * step, r, GRAY);

    const res = analyzeImage(c.image, { whiteThreshold: 180, autoWhite: true });

    expect(res.tiles).toHaveLength(1);
    expect(res.pips).toHaveLength(27);
    const mid = (res.tiles[0].minX + res.tiles[0].maxX) / 2;
    const left = res.pips.filter((p) => p.x < mid).length;
    expect([left, res.pips.length - left].sort((a, b) => b - a)).toEqual([15, 12]);

    // Colour is exposed so a later pass can cross-check count against the set's
    // colour-per-number map: tan reads warm, gray reads neutral.
    const halves = res.tiles[0].halves;
    const warm = halves.find((h) => h && h.sat > 40);
    const neutral = halves.find((h) => h && h.sat <= 40);
    expect(warm?.hue).toBeCloseTo(34, -1);
    expect(neutral?.sat).toBeLessThan(10);
  });

  it('splits blobs where pips touch instead of dropping them', () => {
    const c = canvas(500, 320);
    c.rect(50, 50, 450, 270, FACE);
    const purple: Rgb = [40, 30, 120];
    const r = 16;
    for (const x of [100, 180, 260]) c.disc(x, 90, r, purple); // isolated
    for (const x of [340, 340 + 2 * r - 2]) c.disc(x, 90, r, purple); // touching pair
    for (let i = 0; i < 3; i++) c.disc(120 + i * (2 * r - 2), 200, r, purple); // run of 3

    const res = analyzeImage(c.image, { whiteThreshold: 180, autoWhite: true });

    expect(res.pips).toHaveLength(8);
    expect(res.pips.every((p) => p.tile === 0)).toBe(true);
  });
});
