'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui';
import { FRAMES, getFrame } from '@/lib/frames';
import { DEFAULT_LABEL, LABEL_COLORS, LABEL_FONTS, MAX_LABEL_CHARS, RIBBON_STYLES } from '@/lib/labels';
import type { NameLabel, RibbonStyle } from '@/lib/types';

const input =
  'h-10 w-full rounded-lg border border-surface-container-high bg-surface-container-low px-3 text-body-lg outline-none focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20';

const colourOptions = LABEL_COLORS.map((o) => ({
  value: o.value,
  label: o.name,
  lead: <span className={`h-4 w-4 rounded-full border ${o.value === '#ffffff' ? 'border-outline-variant' : 'border-transparent'}`} style={{ backgroundColor: o.value }} />,
}));

/** Name label for the selected photo: the name, its design, colour, font and size. */
export default function LabelPanel({
  label,
  hasPhoto,
  slotNo,
  sameName,
  onSameNameChange,
  applyAll,
  onApplyAllChange,
  onChange,
}: {
  label: NameLabel | null | undefined;
  hasPhoto: boolean;
  slotNo: number;
  sameName: boolean;
  onSameNameChange: (on: boolean) => void;
  applyAll: boolean;
  onApplyAllChange: (on: boolean) => void;
  onChange: (change: Partial<NameLabel>) => void;
}) {
  const l = label ?? DEFAULT_LABEL;
  const active = 'bg-primary-container text-white shadow';
  const idle = 'bg-surface-container text-navy hover:bg-surface-container-high';

  return (
    <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-label-lg text-navy">
          <Icon name="label" className="text-primary-container" /> Name label
        </p>
        <span className="rounded-md bg-surface-container px-2 py-1 text-label-md">Slot #{String(slotNo).padStart(2, '0')}</span>
      </div>

      {!hasPhoto ? (
        <p className="text-body-md text-secondary">Add a photo to this slot first, then write a name on it.</p>
      ) : (
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 flex items-center justify-between text-label-lg text-navy">
              Name on this photo <span className="text-body-sm font-normal text-secondary">{l.text.length}/{MAX_LABEL_CHARS}</span>
            </span>
            <input className={input} value={l.text} maxLength={MAX_LABEL_CHARS} onChange={(e) => onChange({ text: e.target.value })} placeholder="e.g. Johnathan" />
          </label>
          <label className="-mt-2 flex cursor-pointer items-start gap-3 rounded-lg bg-surface-container px-3 py-2.5">
            <input type="checkbox" checked={sameName} onChange={(e) => onSameNameChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#d6336c]" />
            <span className="text-label-lg text-navy">
              Same name on all photos
              <span className="block text-body-sm font-normal text-secondary">Writes this name on every photo, including ones you add later</span>
            </span>
          </label>

          <Dropdown
            label="Design"
            value={l.frame ?? 'none'}
            options={[
              { value: 'none', label: 'No design', lead: <Icon name="block" className="!text-[18px]" /> },
              ...FRAMES.map((o) => ({
                value: o.id,
                label: o.label,
                // eslint-disable-next-line @next/next/no-img-element
                lead: <img src={o.src} alt="" className="h-6 w-6 rounded-full bg-surface-container" />,
              })),
            ]}
            onChange={(v) => {
              const def = getFrame(v);
              onChange(def ? { frame: v, color: def.ink, ribbonColor: def.ribbon } : { frame: undefined });
            }}
          />

          <div className="grid grid-cols-2 gap-3">
            <Dropdown
              label="Label style"
              value={l.ribbon ?? 'classic'}
              options={RIBBON_STYLES.map((o) => ({ value: o.id as string, label: o.label, lead: <Icon name={o.icon} className="!text-[18px]" /> }))}
              onChange={(v) => onChange({ ribbon: v as RibbonStyle })}
            />
            <Dropdown label="Ribbon colour" value={l.ribbonColor ?? '#e8467c'} options={colourOptions} onChange={(ribbonColor) => onChange({ ribbonColor })} />
          </div>

          <div className="grid grid-cols-1 gap-3">
            <Dropdown
              label="Text colour"
              value={l.color}
              options={colourOptions}
              onChange={(color) => onChange({ color })}
            />
          </div>

          <div className="grid grid-cols-[1fr_auto] items-end gap-3">
            <Dropdown
              label="Font"
              value={l.font}
              options={LABEL_FONTS.map((f) => ({
                value: f.id,
                label: f.label,
                lead: (
                  <span className="w-7 text-center text-[17px] leading-none" style={{ fontFamily: `var(${f.cssVar})`, fontWeight: f.heavy }}>
                    Aa
                  </span>
                ),
              }))}
              onChange={(font) => onChange({ font })}
            />
            <div className="flex gap-1.5" role="group" aria-label="Text style">
              <button
                type="button"
                aria-pressed={l.bold !== false}
                aria-label="Bold"
                title="Bold"
                onClick={() => onChange({ bold: l.bold === false })}
                className={`h-10 w-10 rounded-lg text-[17px] font-extrabold transition ${l.bold !== false ? active : idle}`}
              >
                B
              </button>
              <button
                type="button"
                aria-pressed={!!l.italic}
                aria-label="Italic"
                title="Italic"
                onClick={() => onChange({ italic: !l.italic })}
                className={`h-10 w-10 rounded-lg font-serif text-[17px] font-bold italic transition ${l.italic ? active : idle}`}
              >
                I
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 items-end gap-3">
            <label className="block">
              <span className="mb-1.5 flex items-center justify-between text-label-lg text-navy">
                Outline <span className="text-primary-container">{Math.round((l.stroke ?? 0) * 100)}%</span>
              </span>
              <input type="range" className="slider h-10 w-full" min={0} max={100} step={5} value={Math.round((l.stroke ?? 0) * 100)} onChange={(e) => onChange({ stroke: Number(e.target.value) / 100 })} aria-label="Outline thickness" />
            </label>
            <Dropdown label="Outline colour" value={l.strokeColor ?? '#ffffff'} options={colourOptions} onChange={(strokeColor) => onChange({ strokeColor })} />
          </div>

          <label className="block">
            <span className="mb-1 flex items-center justify-between text-label-lg text-navy">
              Size <span className="text-primary-container">{Math.round(l.size * 100)}%</span>
            </span>
            <input type="range" className="slider w-full" min={60} max={160} step={5} value={Math.round(l.size * 100)} onChange={(e) => onChange({ size: Number(e.target.value) / 100 })} aria-label="Label size" />
          </label>

          <label className="flex cursor-pointer items-center gap-3 rounded-lg bg-surface-container px-3 py-2.5">
            <input type="checkbox" checked={applyAll} onChange={(e) => onApplyAllChange(e.target.checked)} className="h-4 w-4 accent-[#d6336c]" />
            <span className="text-label-lg text-navy">Apply this design to all photos</span>
          </label>
          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => onChange({ text: '' })}
              disabled={!l.text}
              className="flex h-10 items-center justify-center gap-1.5 rounded-lg border border-error-container text-label-md text-error hover:bg-error-container/40 disabled:opacity-40"
            >
              <Icon name="delete" className="!text-[16px]" /> Remove name
            </button>
          </div>
          <p className="text-body-sm text-secondary">Each photo has its own name. With the box ticked, the ribbon, colours, font and size are the same on every photo, and new photos get them too. Untick it to style one photo differently.</p>
        </div>
      )}
    </div>
  );
}

/** A dropdown whose options can carry a small picture (an icon or a colour dot), which a plain select cannot show. */
function Dropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; lead: ReactNode }[];
  onChange: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('pointerdown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <span className="mb-1.5 block text-label-lg text-navy">{label}</span>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center gap-2 rounded-lg border border-surface-container-high bg-surface-container-low px-3 text-body-lg text-navy outline-none focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20"
      >
        {current.lead}
        <span className="flex-1 truncate text-left">{current.label}</span>
        <Icon name="expand_more" className={`!text-[20px] text-secondary transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-surface-container-high bg-surface-container-lowest p-1 shadow-xl">
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-body-md ${o.value === value ? 'bg-primary-container text-white' : 'text-navy hover:bg-surface-container'}`}
              >
                {o.lead}
                <span className="truncate">{o.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
