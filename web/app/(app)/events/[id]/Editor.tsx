'use client';

import { createPortal } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LogoLoader from '@/components/LogoLoader';
import { Icon, Spinner } from '@/components/ui';
import { resolveSetup, type ConfiguredEvent } from '@/lib/event';
import { ApiError, api } from '@/lib/api';
import { DEFAULT_LABEL, ensureLabelFonts, preloadFrames } from '@/lib/labels';
import { clampPan, drawSheet, exportPng, hitSlot, importPhoto, MIN_ZOOM, type SheetFormat } from '@/lib/render';
import type { PublicEvent } from '@/lib/server/events';
import type { NameLabel, Photo, SlotData } from '@/lib/types';
import LabelPanel from './LabelPanel';

const CANVAS_PX_PER_MM = 4.5;
/** The high quality export: 700 DPI. */
const HQ_SCALE = 700 / 300;
const norm = (d: number) => {
  const r = ((((d + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
};

interface Drag {
  slot: number;
  x: number;
  y: number;
  ox: number;
  oy: number;
  moved: boolean;
}

export default function Editor({ event, onEvent, headerSlot }: { event: ConfiguredEvent; onEvent: (e: PublicEvent) => void; headerSlot: HTMLElement | null }) {
  const { layout, shape } = useMemo(() => resolveSetup(event.setup), [event.setup]);

  // Photos live in memory only. They are never saved or uploaded, and a refresh clears them.
  const [photos, setPhotos] = useState<(Photo | null)[]>(() => Array(layout.count).fill(null));
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState<'jpeg' | 'pdf'>('jpeg');
  const [maxQuality, setMaxQuality] = useState(true); // 700 DPI by default, untick for 300
  const [banner, setBanner] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // On a large screen each column is as tall as the space left under the headers, and scrolls inside that.
  const [colMax, setColMax] = useState<number | undefined>(undefined);
  const fileRef = useRef<HTMLInputElement>(null);
  const pickTarget = useRef<number | null>(null);
  const drag = useRef<Drag | null>(null);

  // Label fonts download on first use, so redraw once they are in, or the first names show in a fallback font.
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let live = true;
    void ensureLabelFonts().then(() => live && setFontsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  /* ---- draw ---- */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    drawSheet(c, layout, shape.clip, photos, CANVAS_PX_PER_MM, { selected });
  }, [photos, selected, layout, shape, fontsReady]);

  // Overlay designs are images, so redraw once the ones in use have arrived.
  const frameIds = photos.map((p) => p?.label?.frame).join(',');
  useEffect(() => {
    let live = true;
    void preloadFrames(frameIds.split(',')).then((fresh) => live && fresh && setFontsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, [frameIds]);

  useEffect(() => {
    const fit = () => {
      const g = gridRef.current;
      if (!g || innerWidth < 1024 || !g.offsetParent) return setColMax(undefined);
      setColMax(Math.max(320, innerHeight - g.getBoundingClientRect().top - 16));
    };
    fit();
    addEventListener('resize', fit);
    // the editor is hidden while the Setup tab is open, so measure again when it comes back
    const ro = new ResizeObserver(fit);
    if (gridRef.current) ro.observe(gridRef.current);
    return () => {
      removeEventListener('resize', fit);
      ro.disconnect();
    };
  }, [banner]);

  /* ---- photos are not saved, so warn before a refresh or close throws them away ---- */
  const hasPhotos = photos.some(Boolean);
  useEffect(() => {
    if (!hasPhotos) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [hasPhotos]);

  const patch = useCallback(
    (i: number, change: Partial<SlotData>) => {
      setPhotos((prev) =>
        prev.map((p, idx) => {
          if (idx !== i || !p) return p;
          const next = { ...p, ...change };
          const s = layout.slots[i];
          return { ...next, ...clampPan(next, s.w, s.h) };
        }),
      );
    },
    [layout],
  );

  /** Zoom one photo by a step, keeping it covering its frame. */
  const zoomBy = useCallback(
    (i: number, d: number) => {
      setPhotos((prev) =>
        prev.map((p, idx) => {
          if (idx !== i || !p) return p;
          const next = { ...p, zoom: Math.min(3, Math.max(MIN_ZOOM, p.zoom + d)) };
          const s = layout.slots[i];
          return { ...next, ...clampPan(next, s.w, s.h) };
        }),
      );
    },
    [layout],
  );

  /* ---- mouse wheel over a photo zooms it (needs a non-passive listener to stop the page from scrolling) ---- */
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      const r = c.getBoundingClientRect();
      const i = hitSlot(layout, shape.clip, ((e.clientX - r.left) / r.width) * layout.pageW, ((e.clientY - r.top) / r.height) * layout.pageH);
      if (i < 0 || !photos[i]) return;
      e.preventDefault();
      setSelected(i);
      zoomBy(i, e.deltaY < 0 ? 0.1 : -0.1);
    };
    c.addEventListener('wheel', onWheel, { passive: false });
    return () => c.removeEventListener('wheel', onWheel);
  }, [layout, shape, photos, zoomBy]);

  /* ---- adding photos ---- */
  const addFiles = async (files: FileList | null, first: number | null) => {
    if (!files || files.length === 0) return;
    const empties = photos.map((p, i) => (p ? -1 : i)).filter((i) => i >= 0 && i !== first);
    const targets = first != null ? [first, ...empties] : empties;
    if (targets.length === 0) {
      setBanner('All slots are full. Remove a photo or use Replace.');
      return;
    }
    setBusy(true);
    const next = [...photos];
    let failed = 0;
    for (const [n, file] of [...files].slice(0, targets.length).entries()) {
      try {
        const replaced = photos[targets[n]];
        const fresh = await importPhoto(file);
        if (replaced?.label) fresh.label = replaced.label; // replacing a photo keeps the name written on it
        else if (applyAll || sameName) {
          const look = photos.find((q) => q?.label?.text.trim())?.label ?? photos.find((q) => q?.label)?.label;
          // a new photo starts with the same look, and the shared name when "same name on all photos" is on (else its own empty name)
          if (look) fresh.label = { ...look, text: sameName ? look.text : '' };
        }
        next[targets[n]] = fresh;
      } catch {
        failed++;
      }
    }
    setPhotos(next);
    setSelected(targets[0]);
    setBusy(false);
    setBanner(failed ? `${failed} file${failed > 1 ? 's' : ''} could not be read as images.` : null);
    if (files.length > targets.length) setBanner(`Only ${targets.length} slot${targets.length > 1 ? 's were' : ' was'} free, extra photos were skipped.`);
  };

  const pick = (target: number | null) => {
    pickTarget.current = target;
    if (fileRef.current) {
      fileRef.current.value = '';
      fileRef.current.click();
    }
  };

  /* ---- canvas pointer handling ---- */
  const toMm = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * layout.pageW, y: ((e.clientY - r.top) / r.height) * layout.pageH };
  };

  // Fingers (or the mouse) that are on the sheet right now, and a two-finger pinch in progress.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ slot: number; dist: number; zoom: number } | null>(null);
  const spread = () => {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);

    // A second finger turns the drag into a pinch that zooms the photo under the two fingers.
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const r = canvasRef.current!.getBoundingClientRect();
      const mx = (((a.x + b.x) / 2 - r.left) / r.width) * layout.pageW;
      const my = (((a.y + b.y) / 2 - r.top) / r.height) * layout.pageH;
      const hit = hitSlot(layout, shape.clip, mx, my);
      const slot = hit >= 0 && photos[hit] ? hit : photos[selected] ? selected : -1;
      drag.current = null; // two fingers do not move the photo
      pinch.current = slot >= 0 ? { slot, dist: Math.max(1, spread()), zoom: photos[slot]!.zoom } : null;
      if (slot >= 0) setSelected(slot);
      return;
    }
    if (pointers.current.size > 2) return;

    const { x, y } = toMm(e);
    const i = hitSlot(layout, shape.clip, x, y);
    if (i < 0) return;
    setSelected(i);
    const p = photos[i];
    drag.current = { slot: i, x: e.clientX, y: e.clientY, ox: p?.ox ?? 0, oy: p?.oy ?? 0, moved: false };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    const pz = pinch.current;
    if (pz && pointers.current.size >= 2) {
      const zoom = Math.min(3, Math.max(MIN_ZOOM, pz.zoom * (spread() / pz.dist)));
      patch(pz.slot, { zoom });
      return;
    }

    const d = drag.current;
    if (!d || !photos[d.slot]) return;
    const r = canvasRef.current!.getBoundingClientRect();
    const s = layout.slots[d.slot];
    const dx = (((e.clientX - d.x) / r.width) * layout.pageW) / s.w;
    const dy = (((e.clientY - d.y) / r.height) * layout.pageH) / s.h;
    if (Math.abs(dx) + Math.abs(dy) > 0.015) d.moved = true;
    patch(d.slot, { ox: d.ox + dx, oy: d.oy + dy });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const d = drag.current;
    drag.current = null; // the finger left over after a pinch does not start dragging
    if (d && !d.moved && !photos[d.slot]) pick(d.slot);
  };

  /* ---- tools for the selected slot ---- */
  const sel = photos[selected] ?? null;

  const resetSheet = () => {
    if (hasPhotos && !confirm('Remove all photos from this sheet and start again?')) return;
    photos.forEach((p) => p?.bmp.close());
    setPhotos(Array(layout.count).fill(null));
    setSelected(0);
    setBanner(null);
  };

  /* ---- name labels ---- */
  // Merges into the label as it is right now (not as it was at the last render), so quick clicks on design,
  // colour and font in a row do not undo each other.
  // With "Apply to all photos" on, every change to the look (not the name) goes to all photos, and new photos get the same look.
  const [applyAll, setApplyAll] = useState(true);
  // With "Same name on all photos" on, typing a name on one photo writes it on every photo, and new photos get it too.
  const [sameName, setSameName] = useState(false);

  const setLabel = (change: Partial<NameLabel>) => {
    const i = selected;
    const isName = 'text' in change;
    const everyone = isName ? sameName : applyAll;
    setPhotos((prev) =>
      prev.map((p, idx) => (p && (idx === i || everyone) ? { ...p, label: { ...(p.label ?? DEFAULT_LABEL), ...change } } : p)),
    );
  };

  const sameDesignForAll = () => {
    const from = sel?.label ?? DEFAULT_LABEL;
    setPhotos((prev) =>
      prev.map((p) => (p ? { ...p, label: { ...(p.label ?? DEFAULT_LABEL), color: from.color, frame: from.frame, ribbon: from.ribbon, ribbonColor: from.ribbonColor, font: from.font, size: from.size, bold: from.bold, italic: from.italic, stroke: from.stroke, strokeColor: from.strokeColor } } : p)),
    );
  };

  // Writes the selected photo's name on every photo, for a sheet where all of them carry the same name (the event name, say).
  const sameNameForAll = () => {
    const from = sel?.label ?? DEFAULT_LABEL;
    setPhotos((prev) => prev.map((p) => (p ? { ...p, label: { ...(p.label ?? DEFAULT_LABEL), ...(applyAll ? from : {}), text: from.text } } : p)));
  };

  /* ---- output: each download or print adds one to the event's counter on the server ---- */
  const count = async (kind: 'download' | 'print', fileType: 'jpeg' | 'pdf') => {
    try {
      const { event: updated } = await api.countEvent(event.id, kind, { format: fileType, dpi: Math.round(300 * (maxQuality ? HQ_SCALE : 1)), photos: photos.filter(Boolean).length });
      onEvent(updated);
    } catch (e) {
      setBanner(e instanceof ApiError ? e.message : 'Could not update the count. Check your connection.');
    }
  };

  /** The sheet, always at the full 300 DPI. It is never made smaller to fit: a lower quality print is worse than an error. */
  const makeSheet = async (as: SheetFormat = format) => {
    try {
      return await exportPng(layout, shape.clip, photos, maxQuality ? HQ_SCALE : 1, as);
    } catch (e) {
      console.error('Sheet export failed, trying once more', e);
      await new Promise((r) => setTimeout(r, 300)); // let the browser free the memory of the first try
      return await exportPng(layout, shape.clip, photos, maxQuality ? HQ_SCALE : 1, as);
    }
  };

  // On a phone the sheet takes a few seconds to make, and by then the browser no longer counts the tap as a click, so it blocks
  // an automatic download. So the phone gets a "ready" box with its own Save and Share buttons, and the tap on those works.
  const [ready, setReady] = useState<{ url: string; name: string; file: File } | null>(null);
  const closeReady = () => {
    if (ready) URL.revokeObjectURL(ready.url);
    setReady(null);
  };

  // what the buttons and the overlay show while a sheet is being made, and for a moment after a download
  const [job, setJob] = useState<'download' | 'print' | null>(null);
  const [justDone, setJustDone] = useState(false);

  const download = async () => {
    setBusy(true);
    setJob('download');
    setJustDone(false);
    try {
      const blob = await makeSheet();
      const name = `${event.name} - sheet ${event.downloads + 1}.${format === 'pdf' ? 'pdf' : 'jpg'}`;
      if (matchMedia('(pointer: coarse)').matches) {
        setReady({ url: URL.createObjectURL(blob), name, file: new File([blob], name, { type: format === 'pdf' ? 'application/pdf' : 'image/jpeg' }) });
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      }
      void count('download', format);
      setJustDone(true);
      setTimeout(() => setJustDone(false), 4000);
    } catch (e) {
      setBanner(`Could not make the sheet on this device (${e instanceof Error ? e.message : 'unknown error'}). Try fewer photos on the sheet, or use a computer.`);
    } finally {
      setBusy(false);
      setJob(null);
    }
  };

  /* The sheet image is mounted in #print-root, the only thing visible when printing. */
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const print = async () => {
    setBusy(true);
    setJob('print');
    try {
      setPrintUrl(URL.createObjectURL(await makeSheet('jpeg')));
    } catch (e) {
      setBanner(`Could not make the sheet on this device (${e instanceof Error ? e.message : 'unknown error'}). Try fewer photos on the sheet, or use a computer.`);
    } finally {
      setBusy(false);
      setJob(null);
    }
  };
  useEffect(() => {
    if (!printUrl) return;
    // The browser fires this when the print dialog closes. It cannot tell Print from Cancel, so a
    // cancelled dialog is counted too. With Chrome in --kiosk-printing mode there is no dialog to cancel.
    const done = () => {
      setPrintUrl(null);
      void count('print', 'jpeg');
    };
    addEventListener('afterprint', done, { once: true });
    const t = setTimeout(() => window.print(), 250);
    return () => {
      clearTimeout(t);
      removeEventListener('afterprint', done);
      URL.revokeObjectURL(printUrl);
    };
  }, [printUrl]);

  const placed = photos.filter(Boolean).length;
  const zoomPct = Math.round((sel?.zoom ?? 1) * 100);

  return (
    <div>
      {ready && (
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-navy p-4 pb-6 text-white shadow-2xl">
          <p className="mb-3 flex items-center gap-2 text-label-lg">
            <Icon name="check_circle" fill className="text-tertiary-container" /> Your sheet is ready
          </p>
          <div className="grid grid-cols-2 gap-2">
            <a href={ready.url} download={ready.name} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-container text-label-lg text-white">
              <Icon name="download" className="!text-[20px]" /> Save image
            </a>
            <button
              type="button"
              onClick={() => {
                if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [ready.file] })) void navigator.share({ files: [ready.file], title: ready.name }).catch(() => {});
                else window.open(ready.url, '_blank');
              }}
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-white/10 text-label-lg text-white"
            >
              <Icon name="share" className="!text-[20px]" /> Share
            </button>
          </div>
          <button type="button" onClick={closeReady} className="mt-3 w-full text-center text-label-md text-white/70">
            Close
          </button>
        </div>
      )}
      <div className="space-y-space-md">
        {banner && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl bg-gradient-to-r from-primary-container to-[#8f1d3f] px-4 py-3 text-body-md text-white shadow-lg">
            <Icon name="info" fill />
            <span className="min-w-0 flex-1 font-medium">{banner}</span>
            <button onClick={() => setBanner(null)} className="rounded-lg bg-navy/70 px-3 py-1.5 text-label-md hover:bg-navy">Dismiss ×</button>
          </div>
        )}

        <div ref={gridRef} className="flex flex-col gap-space-md lg:grid lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* stage */}
          <section className="sticky top-[58px] z-20 overflow-hidden rounded-2xl bg-gradient-to-br from-navy via-[#10264a] to-[#2a1a22] p-2 shadow-lg sm:p-5 md:top-[66px] lg:self-start lg:overflow-y-auto lg:overscroll-contain" style={{ maxHeight: colMax }}>
            <div className="mb-3 hidden flex-wrap items-center justify-between gap-2 text-label-md uppercase tracking-wider text-white/80 lg:flex">
              <span className="flex items-center gap-2">
                <Icon name="crop_free" className="!text-[16px]" /> {layout.pageW > layout.pageH ? 'Landscape' : 'Portrait'} grid ({layout.pageW} × {layout.pageH} mm)
              </span>
              <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 normal-case tracking-normal">
                <Icon name="grid_view" className="!text-[16px] text-tertiary-container" /> {placed} / {layout.count} photos placed
              </span>
            </div>
            <div className="relative mx-auto" style={{ maxWidth: layout.pageW > layout.pageH ? 760 : 540 }}>
              <canvas
                ref={canvasRef}
                width={Math.round(layout.pageW * CANVAS_PX_PER_MM)}
                height={Math.round(layout.pageH * CANVAS_PX_PER_MM)}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="mx-auto block h-auto w-auto max-h-[36vh] max-w-full touch-none rounded bg-white shadow-2xl lg:max-h-none lg:w-full"
                style={{ cursor: sel ? 'grab' : 'pointer' }}
              />
              {busy && (
                <div className="absolute inset-0 flex items-center justify-center rounded bg-navy/75 px-4 text-center">
                  <LogoLoader size={84} onDark label={job ? 'Preparing your sheet… this can take a few seconds' : 'Preparing…'} />
                </div>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-3 lg:mt-4">
              <span className="hidden items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-label-md text-white sm:flex">
                <Icon name="pan_tool" className="!text-[16px]" /> Drag to move · scroll to zoom
              </span>
            </div>
          </section>

          {/* controls */}
          <aside className="space-y-space-md lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-1" style={{ maxHeight: colMax }}>
            <Panel>
              <div className="mb-4 flex items-center justify-between">
                <p className="flex items-center gap-2 text-label-lg text-navy">
                  <Icon name="tune" className="text-primary-container" /> Precision Transform
                </p>
                <span className="rounded-md bg-surface-container px-2 py-1 text-label-md">Slot #{String(selected + 1).padStart(2, '0')}</span>
              </div>

              <div className={sel ? '' : 'pointer-events-none opacity-50'}>
                <div className="mb-1 flex items-center justify-between text-label-lg">
                  <span className="flex items-center gap-2 text-navy"><Icon name="zoom_in" className="!text-[18px]" /> Crop Zoom</span>
                  <span className="text-primary-container">{zoomPct}%</span>
                </div>
                <div className="flex items-center gap-3">
                  <StepButton icon="remove" label="Zoom out" onClick={() => patch(selected, { zoom: Math.max(MIN_ZOOM, (sel?.zoom ?? 1) - 0.1) })} />
                  <input
                    type="range"
                    className="slider flex-1"
                    min={Math.round(MIN_ZOOM * 100)}
                    max={300}
                    value={zoomPct}
                    onChange={(e) => patch(selected, { zoom: Number(e.target.value) / 100 })}
                    aria-label="Crop zoom"
                  />
                  <StepButton icon="add" label="Zoom in" onClick={() => patch(selected, { zoom: Math.min(3, (sel?.zoom ?? 1) + 0.1) })} />
                </div>

                <p className="mb-2 mt-5 flex items-center gap-2 text-label-lg text-navy"><Icon name="rotate_right" className="!text-[18px]" /> Quick Orientation</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => patch(selected, { rot: norm((sel?.rot ?? 0) - 90), ox: 0, oy: 0 })} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-surface-container text-label-lg text-navy hover:bg-surface-container-high">
                    <Icon name="rotate_left" className="!text-[20px]" /> −90°
                  </button>
                  <button onClick={() => patch(selected, { rot: norm((sel?.rot ?? 0) + 90), ox: 0, oy: 0 })} className="flex h-10 items-center justify-center gap-2 rounded-lg bg-surface-container text-label-lg text-navy hover:bg-surface-container-high">
                    <Icon name="rotate_right" className="!text-[20px]" /> +90°
                  </button>
                </div>

                <div className="mb-1 mt-5 flex items-center justify-between text-label-lg">
                  <span className="text-navy">Fine Tilt Alignment</span>
                  <span className="font-mono text-navy">{(sel?.tilt ?? 0).toFixed(1).replace('.0', '')}°</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    className="slider blue flex-1"
                    min={-45}
                    max={45}
                    step={0.5}
                    value={sel?.tilt ?? 0}
                    onChange={(e) => patch(selected, { tilt: Number(e.target.value) })}
                    aria-label="Fine tilt"
                  />
                  <button onClick={() => patch(selected, { tilt: 0 })} className="rounded-md bg-surface-container px-3 py-1.5 text-label-md text-navy hover:bg-surface-container-high">Zero</button>
                </div>
              </div>
              {!sel && <p className="mt-3 text-body-md text-secondary">Tap an empty slot on the sheet to add a photo, then adjust it here.</p>}
            </Panel>

            <LabelPanel label={sel?.label} hasPhoto={!!sel} slotNo={selected + 1} onChange={setLabel} sameName={sameName} onSameNameChange={(on) => { setSameName(on); if (on) sameNameForAll(); }} applyAll={applyAll} onApplyAllChange={(on) => { setApplyAll(on); if (on) sameDesignForAll(); }} />

            <Panel>
              <div className="space-y-3">
                <div>
                  <p className="text-label-lg text-navy">
                    Output · {Math.round(layout.pxW * (maxQuality ? HQ_SCALE : 1))} × {Math.round(layout.pxH * (maxQuality ? HQ_SCALE : 1))} px
                  </p>
                  <p className="text-body-md text-secondary">
                    {layout.pageW}×{layout.pageH} mm · {maxQuality ? '700' : '300'} DPI {format === 'pdf' ? 'PDF' : 'JPEG'}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2" role="group" aria-label="File type">
                  {(['jpeg', 'pdf'] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={format === f}
                      onClick={() => setFormat(f)}
                      className={`h-9 rounded-lg text-label-lg transition ${format === f ? 'bg-primary-container text-white shadow' : 'bg-surface-container text-navy hover:bg-surface-container-high'}`}
                    >
                      {f === 'jpeg' ? 'JPEG' : 'PDF'}
                    </button>
                  ))}
                </div>
                <label className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-surface-container px-3 py-2.5">
                  <input type="checkbox" checked={maxQuality} onChange={(e) => setMaxQuality(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#d6336c]" />
                  <span className="text-body-md text-navy">
                    Maximum quality · 700 DPI
                    <span className="block text-body-sm text-secondary">Bigger file, needs a computer</span>
                  </span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={print} disabled={placed === 0 || busy} className="flex h-11 items-center justify-center gap-2 rounded-lg bg-surface-container px-4 text-label-lg text-navy hover:bg-surface-container-high disabled:opacity-40">
                    {job === 'print' ? <Spinner /> : <Icon name="print" className="!text-[18px]" />} {job === 'print' ? 'Preparing…' : 'Print'}
                  </button>
                  <button
                    onClick={download}
                    disabled={placed === 0 || busy}
                    className={`flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-label-lg text-white transition disabled:opacity-60 ${justDone ? 'bg-[#1e8e4e]' : 'bg-navy hover:bg-[#1f3a5c]'}`}
                  >
                    {job === 'download' ? <Spinner /> : <Icon name={justDone ? 'check_circle' : 'download'} className="!text-[18px]" />}
                    {job === 'download' ? 'Preparing…' : justDone ? 'Downloaded' : format === 'pdf' ? 'PDF' : 'JPEG'}
                  </button>
                </div>
              </div>
            </Panel>
          </aside>
        </div>
      </div>

      {/* Reset Sheet lives in the event's header bar, next to the Photos and Setup tabs */}
      {headerSlot &&
        createPortal(
          <button
            onClick={resetSheet}
            disabled={placed === 0}
            className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-label-md text-white transition hover:bg-white/10 disabled:opacity-40"
          >
            <Icon name="restart_alt" className="!text-[18px] text-tertiary-container" /> Reset Sheet
          </button>,
          headerSlot,
        )}

      {printUrl &&
        createPortal(
          // eslint-disable-next-line @next/next/no-img-element
          <>
            {/* the paper size is fixed, so the browser prints the 300 dpi sheet 1:1 instead of fitting it to whatever paper is set */}
            <style>{`@media print { @page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: 0; } #print-root img { width: ${layout.pageW}mm; height: ${layout.pageH}mm; } }`}</style>
            <img src={printUrl} alt="" />
          </>,
          document.getElementById('print-root')!,
        )}

      <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(e.target.files, pickTarget.current)} />
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">{children}</div>;
}

function StepButton({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-container text-navy hover:bg-surface-container-high">
      <Icon name={icon} className="!text-[20px]" />
    </button>
  );
}

