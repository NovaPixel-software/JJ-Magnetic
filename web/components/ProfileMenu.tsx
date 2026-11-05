'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Icon, Initials } from './ui';

export interface MenuItem {
  label: string;
  icon: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
}

/** The profile button on the right of the header. Click it to open a dropdown of account actions. */
export default function ProfileMenu({ name, email, items, dark = false }: { name: string; email: string; items: MenuItem[]; dark?: boolean }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('mousedown', away);
    addEventListener('keydown', esc);
    return () => {
      removeEventListener('mousedown', away);
      removeEventListener('keydown', esc);
    };
  }, [open]);

  const row = 'flex w-full items-center gap-3 px-4 py-2.5 text-left text-label-lg transition hover:bg-surface-container-low';

  return (
    <div ref={box} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-2 transition sm:pr-3 ${dark ? 'border-white/30 bg-white/15 hover:bg-white/25' : 'border-surface-container-high bg-surface-container-low hover:bg-surface-container'}`}
      >
        {dark ? (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-label-md text-[#c23a6c]">
            {name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')}
          </span>
        ) : (
          <Initials name={name} className="h-8 w-8" />
        )}
        <span className={`hidden max-w-[140px] truncate text-label-lg sm:block ${dark ? 'text-white' : 'text-navy'}`}>{name}</span>
        <Icon name="expand_more" className={`!text-[20px] transition ${dark ? 'text-white/80' : 'text-secondary'} ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div role="menu" className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest shadow-xl">
          <div className="border-b border-surface-container px-4 py-3">
            <p className="truncate text-label-lg text-navy">{name}</p>
            <p className="truncate text-body-sm text-secondary">{email}</p>
          </div>
          <div className="py-1">
            {items.map((it) => {
              const cls = `${row} ${it.danger ? 'text-error' : 'text-navy'}`;
              const body = (
                <>
                  <Icon name={it.icon} className="!text-[20px]" /> {it.label}
                </>
              );
              return it.href ? (
                <Link key={it.label} href={it.href} role="menuitem" onClick={() => setOpen(false)} className={cls}>
                  {body}
                </Link>
              ) : (
                <button
                  key={it.label}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    it.onClick?.();
                  }}
                  className={cls}
                >
                  {body}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
