// CONTRACT — implemented by the vision workstream. Do not change the props shape.
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  analyzeImage,
  loadImageToCanvasSize,
  DEFAULT_WHITE_THRESHOLD,
  WHITE_THRESHOLD_FLOOR,
  WHITE_THRESHOLD_CEILING,
  type Pip,
  type Tile,
} from '../vision/pipCounter.ts';
import './PipCounter.css';

export type PipCounterProps = {
  /** Called with the final pip total when the user taps "Use N". */
  onUse: (total: number) => void;
  /** Called when the user dismisses the counter without using a result. */
  onClose: () => void;
  /** Optional label shown in the header, e.g. the player's name. */
  title?: string;
};

const MAX_DIM = 1200;

function cssColor(el: Element | null, name: string, fallback: string): string {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

export default function PipCounter({ onUse, onClose, title }: PipCounterProps) {
  const photoRef = useRef<HTMLCanvasElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const whiteInputRef = useRef<HTMLInputElement | null>(null);

  // Analysis state lives in refs so corrections and re-analysis never go through
  // a React render; only the summary numbers below are state.
  const pipsRef = useRef<Pip[]>([]);
  const tilesRef = useRef<Tile[]>([]);
  const medianDRef = useRef(12);
  const imageDataRef = useRef<ImageData | null>(null);
  const whiteRef = useRef(DEFAULT_WHITE_THRESHOLD);
  const aliveRef = useRef(true);

  const [hasPhoto, setHasPhoto] = useState(false);
  const [total, setTotal] = useState(0);
  const [metaGroups, setMetaGroups] = useState('');
  const [status, setStatus] = useState('');
  const [dims, setDims] = useState('');
  const [white, setWhite] = useState(DEFAULT_WHITE_THRESHOLD);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // ---------- Overlay drawing + summary text ----------
  const render = useCallback(() => {
    const overlay = overlayRef.current;
    const octx = overlay?.getContext('2d');
    if (!overlay || !octx) return;

    const W = overlay.width;
    const H = overlay.height;
    const pips = pipsRef.current;
    const tiles = tilesRef.current;
    const medianD = medianDRef.current;

    octx.clearRect(0, 0, W, H);
    const lw = Math.max(2, W / 400);

    const counts = tiles.map(() => 0);
    for (const p of pips) if (p.tile != null && counts[p.tile] !== undefined) counts[p.tile]++;
    const shown = tiles
      .map((t, i) => ({ t, count: counts[i] }))
      .filter((e) => e.count > 0);

    const tileColor = cssColor(overlay, '--tile', '#2f6fd0');
    const pipColor = cssColor(overlay, '--pip', '#18a558');

    octx.lineWidth = lw;
    octx.strokeStyle = tileColor;
    const fs = Math.max(14, Math.round(medianD * 1.3));
    octx.font = `bold ${fs}px -apple-system, system-ui, sans-serif`;
    octx.textBaseline = 'top';
    for (const { t, count } of shown) {
      const pad = lw * 2;
      const x = t.minX - pad;
      const y = t.minY - pad;
      const w = t.maxX - t.minX + 2 * pad;
      const h = t.maxY - t.minY + 2 * pad;
      octx.strokeRect(x, y, w, h);
      const s = String(count);
      const tw = octx.measureText(s).width;
      octx.fillStyle = tileColor;
      octx.fillRect(x, y - fs * 1.25, tw + fs * 0.6, fs * 1.25);
      octx.fillStyle = '#fff';
      octx.fillText(s, x + fs * 0.3, y - fs * 1.12);
    }
    octx.strokeStyle = pipColor;
    for (const p of pips) {
      octx.beginPath();
      octx.arc(p.x, p.y, p.r + lw * 1.5, 0, Math.PI * 2);
      octx.stroke();
    }

    setTotal(pips.length);
    const loose = pips.filter((p) => p.tile == null).length;
    setMetaGroups(
      shown.length
        ? `${shown.length} tile face${shown.length === 1 ? '' : 's'}: ` +
            `${shown.map((e) => e.count).join(' + ')}` +
            (loose ? ` (+${loose} added by hand)` : '')
        : pips.length
          ? ''
          : 'No white tile faces found — try lowering Tile whiteness',
    );
  }, []);

  // ---------- Detection ----------
  const runAnalysis = useCallback(
    (auto = false) => {
      const image = imageDataRef.current;
      if (!image) return;
      // A fresh photo picks its own whiteness (warm indoor light puts a cream tile
      // well below any fixed threshold); the slider then overrides it.
      const res = analyzeImage(image, {
        whiteThreshold: whiteRef.current,
        autoWhite: auto,
      });
      if (auto && res.whiteThreshold !== whiteRef.current) {
        whiteRef.current = res.whiteThreshold;
        setWhite(res.whiteThreshold);
      }
      pipsRef.current = res.pips;
      tilesRef.current = res.tiles;
      medianDRef.current = res.medianD;
      render();
    },
    [render],
  );

  // ---------- Loading a photo ----------
  const loadFile = useCallback(
    async (file: File) => {
      setStatus(`Reading ${file.name || 'photo'}…`);
      let loaded;
      try {
        loaded = await loadImageToCanvasSize(file, MAX_DIM);
      } catch (err) {
        if (!aliveRef.current) return;
        setStatus(err instanceof Error ? err.message : 'Could not decode this photo.');
        return;
      }
      const photo = photoRef.current;
      const overlay = overlayRef.current;
      const pctx = photo?.getContext('2d', { willReadFrequently: true });
      if (!aliveRef.current || !photo || !overlay || !pctx) {
        loaded.release();
        return;
      }
      photo.width = overlay.width = loaded.width;
      photo.height = overlay.height = loaded.height;
      pctx.drawImage(loaded.source, 0, 0, loaded.width, loaded.height);
      loaded.release();

      imageDataRef.current = pctx.getImageData(0, 0, loaded.width, loaded.height);
      setHasPhoto(true);
      setDims(`${loaded.width}×${loaded.height}`);
      setStatus('');
      runAnalysis(true);
    },
    [runAnalysis],
  );

  const onPick = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void loadFile(f);
      e.target.value = '';
    },
    [loadFile],
  );

  // Re-analyse when the slider is released (its 'change' event), not on every tick.
  useEffect(() => {
    const el = whiteInputRef.current;
    if (!el) return;
    const onCommit = () => {
      whiteRef.current = Number(el.value);
      runAnalysis();
    };
    el.addEventListener('change', onCommit);
    return () => el.removeEventListener('change', onCommit);
  }, [runAnalysis]);

  // ---------- Tap to correct ----------
  const onOverlayPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLCanvasElement>) => {
      const overlay = overlayRef.current;
      if (!overlay || !imageDataRef.current) return;
      const rect = overlay.getBoundingClientRect();
      const x = ((e.clientX - rect.left) * overlay.width) / rect.width;
      const y = ((e.clientY - rect.top) * overlay.height) / rect.height;
      const medianD = medianDRef.current;
      const hitR = Math.max(medianD, 14);
      const pips = pipsRef.current;
      let best = -1;
      let bestD = Infinity;
      pips.forEach((p, i) => {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < hitR && d < bestD) {
          best = i;
          bestD = d;
        }
      });
      if (best >= 0) {
        pipsRef.current = pips.filter((_, i) => i !== best);
      } else {
        const t = tilesRef.current.findIndex(
          (tl) => x >= tl.minX && x <= tl.maxX && y >= tl.minY && y <= tl.maxY,
        );
        pipsRef.current = [...pips, { x, y, r: medianD / 2, tile: t >= 0 ? t : null }];
      }
      render();
    },
    [render],
  );

  // ---------- Modal housekeeping ----------
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="pc-root" role="dialog" aria-modal="true" aria-label="Pip counter">
      <header className="pc-header">
        <h2>{title ?? 'Pip counter'}</h2>
        <span className="pc-dims">{dims}</span>
        <button type="button" className="pc-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>

      <div className="pc-stage">
        {!hasPhoto && (
          <div className="pc-empty">
            <b>No photo yet</b>Shoot straight down, even light, tiles filling the frame.
          </div>
        )}
        <canvas ref={photoRef} hidden={!hasPhoto} />
        <canvas
          ref={overlayRef}
          className="pc-overlay"
          hidden={!hasPhoto}
          onPointerDown={onOverlayPointerDown}
        />
      </div>

      <div className="pc-total">
        <div className={hasPhoto ? 'pc-n' : 'pc-n pc-blank'}>{hasPhoto ? total : '–'}</div>
        <div className="pc-meta">
          <div>{hasPhoto ? (total === 1 ? 'pip counted' : 'pips counted') : ''}</div>
          <div>{metaGroups}</div>
        </div>
      </div>
      <div className="pc-status" role="status">
        {status}
      </div>

      <div className="pc-row">
        <label className="pc-btn">
          Take photo
          <input
            type="file"
            accept="image/*,.heic,.heif"
            capture="environment"
            onChange={onPick}
          />
        </label>
        <label className="pc-btn pc-quiet">
          Choose photo
          <input type="file" accept="image/*,.heic,.heif" onChange={onPick} />
        </label>
      </div>

      <div className="pc-controls">
        <label className="pc-control">
          <span>
            Tile whiteness
            <small>Lower if a tile in shadow is missed; raise if glare on the table is boxed</small>
          </span>
          <span>{white}</span>
          <input
            ref={whiteInputRef}
            type="range"
            min={WHITE_THRESHOLD_FLOOR}
            max={WHITE_THRESHOLD_CEILING}
            value={white}
            onChange={(e) => setWhite(Number(e.target.value))}
          />
        </label>
      </div>

      <p className="pc-hint">
        Each counted pip gets a <kbd>green ring</kbd>; each <em>tile face</em> is boxed with its
        count. Tap a ring to remove a false pip, tap a bare pip to add it. The total updates as you
        correct.
      </p>

      <div className="pc-footer">
        <button
          type="button"
          className="pc-use"
          disabled={!hasPhoto}
          onClick={() => onUse(total)}
        >
          Use {hasPhoto ? total : 0}
        </button>
      </div>
    </div>
  );
}
