'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui';
import { sizeText } from '@/lib/catalog';
import { isConfigured, resolveSetup } from '@/lib/event';
import type { PublicEvent } from '@/lib/server/events';
import Editor from './Editor';
import SetupForm from './SetupForm';

type Tab = 'photos' | 'setup';

/** Everything for one event lives here: its counts, its setup, and the photo editor. */
export default function EventWorkspace({ initial }: { initial: PublicEvent }) {
  const [event, setEvent] = useState(initial);
  const [tab, setTab] = useState<Tab>(isConfigured(initial) ? 'photos' : 'setup');
  // Changing the setup changes the sheet, so the editor starts again with an empty sheet.
  const [sheetKey, setSheetKey] = useState(0);
  // where the editor draws its Reset Sheet button, in this header. It only exists while the Photos tab is open.
  const [headerSlot, setHeaderSlot] = useState<HTMLElement | null>(null);

  // The Photos tab fits the window on a large screen, so the page behind it must not scroll. The Setup form is long, it can.
  const locked = tab === 'photos' && isConfigured(event);
  useEffect(() => {
    if (!locked) return;
    document.documentElement.classList.add('editor-lock');
    return () => document.documentElement.classList.remove('editor-lock');
  }, [locked]);

  const summary = isConfigured(event)
    ? (() => {
        const { template, layout } = resolveSetup(event.setup);
        const size = sizeText(template);
        return `${size} · ${layout.count} per sheet`;
      })()
    : 'Setup not finished';

  return (
    <div className="space-y-space-sm">
      {/* one slim bar: back, name and summary, the two tabs, and the counts */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl bg-navy px-4 py-3 text-white shadow-lg">
        <Link href="/events" aria-label="My Events" title="My Events" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
          <Icon name="arrow_back" className="!text-[20px]" />
        </Link>
        <div className="min-w-0 flex-1 basis-56">
          <h1 className="truncate text-label-lg font-bold leading-tight">{event.name}</h1>
          <p className="truncate text-body-sm text-white/70">{summary}</p>
        </div>
        {isConfigured(event) && (
          <div className="flex gap-1 rounded-xl bg-white/10 p-1">
            <TabButton active={tab === 'photos'} onClick={() => setTab('photos')} icon="add_photo_alternate">
              Photos
            </TabButton>
            <TabButton active={tab === 'setup'} onClick={() => setTab('setup')} icon="tune">
              Setup
            </TabButton>
          </div>
        )}
        {isConfigured(event) && tab === 'photos' && <div ref={setHeaderSlot} className="flex" />}
      </header>

      {(tab === 'setup' || !isConfigured(event)) && (
        <SetupForm
          event={event}
          onCancel={isConfigured(event) ? () => setTab('photos') : undefined}
          onSaved={(updated) => {
            if (JSON.stringify(updated.setup) !== JSON.stringify(event.setup)) setSheetKey((k) => k + 1);
            setEvent(updated);
            setTab('photos');
          }}
        />
      )}

      {/* Kept mounted (just hidden) while the Setup tab is open, so the photos on the sheet are not lost. */}
      {isConfigured(event) && (
        <div hidden={tab !== 'photos'}>
          <Editor key={sheetKey} event={event} onEvent={setEvent} headerSlot={tab === 'photos' ? headerSlot : null} />
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-md transition ${active ? 'bg-white text-primary-container shadow-sm' : 'text-white/70 hover:text-white'}`}
    >
      <Icon name={icon} className="!text-[18px]" /> {children}
    </button>
  );
}
