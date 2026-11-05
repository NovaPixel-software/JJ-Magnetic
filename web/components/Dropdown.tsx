'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon } from './ui';

export interface DropdownOption<T extends string | number> {
  value: T;
  label: string;
}

/**
 * A dropdown in the app's colours. The browser's own <select> list always opens with its own blue highlight, which cannot
 * be restyled, so this draws the list itself. It works with the keyboard too: arrows move, Enter picks, Escape closes.
 * `up` opens the list above the button, for one at the bottom of a box that cuts off whatever sticks out of it.
 */
export default function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  id,
  label,
  icon,
  up = false,
  compact = false,
  className = '',
  listClassName = '',
}: {
  value: T;
  options: DropdownOption<T>[];
  onChange: (v: T) => void;
  id?: string;
  label?: string; // for screen readers, when there is no visible label
  icon?: string; // a Material Symbols name shown in front of the choice
  up?: boolean;
  compact?: boolean; // a smaller button, for a footer or a toolbar
  className?: string;
  listClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  const current = options[selected];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    addEventListener('pointerdown', away);
    return () => removeEventListener('pointerdown', away);
  }, [open]);

  const show = () => {
    setActive(selected);
    setOpen(true);
  };
  const pick = (i: number) => {
    onChange(options[i].value);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') return setOpen(false);
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return show();
      return setActive((a) => Math.min(options.length - 1, Math.max(0, a + (e.key === 'ArrowDown' ? 1 : -1))));
    }
    if ((e.key === 'Enter' || e.key === ' ') && open) {
      e.preventDefault();
      pick(active);
    }
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKey}
        className={`flex w-full items-center gap-2 border bg-white text-left text-label-lg ${compact ? 'h-9 rounded-lg px-2.5' : 'h-11 rounded-xl px-3.5'} text-navy outline-none transition focus-visible:ring-4 focus-visible:ring-primary-container/20 ${open ? 'border-primary-container ring-4 ring-primary-container/15' : 'border-surface-container-high hover:border-primary-container/50'}`}
      >
        {icon && <Icon name={icon} className="!text-[20px] text-primary-container" />}
        <span className="min-w-0 flex-1 truncate">{current?.label}</span>
        <Icon name="expand_more" className={`!text-[20px] text-primary-container transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          role="listbox"
          className={`absolute left-0 z-40 max-h-64 min-w-full overflow-auto rounded-xl border border-surface-container-high bg-white p-1 shadow-xl shadow-[#8f1d3f]/15 ${up ? 'bottom-full mb-1.5' : 'top-full mt-1.5'} ${listClassName}`}
        >
          {options.map((o, i) => (
            <li key={String(o.value)} role="option" aria-selected={o.value === value}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => pick(i)}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-center justify-between gap-3 whitespace-nowrap rounded-lg px-3 py-2.5 text-left text-label-lg transition ${
                  o.value === value ? 'bg-primary-container text-white' : i === active ? 'bg-primary-fixed text-[#8f1d3f]' : 'text-navy'
                }`}
              >
                <span>{o.label}</span>
                {o.value === value && <Icon name="check" className="!text-[18px]" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
