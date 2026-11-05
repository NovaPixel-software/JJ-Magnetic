'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Icon, Spinner } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export default function NewEventPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) return setError('Please enter an event name.');
    setBusy(true);
    setError('');
    try {
      const { event } = await api.createEvent(name.trim());
      router.push(`/events/${event.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/events" className="mb-space-md inline-flex items-center gap-1 text-body-md text-secondary hover:text-navy">
        <Icon name="arrow_back" className="!text-[18px]" /> My Events
      </Link>

      <form onSubmit={create} className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-5 shadow-sm sm:p-6" noValidate>
        <h1 className="text-headline-lg text-navy">New Event</h1>
        <p className="mt-1 text-body-lg text-secondary">Give your event a name. You will set up the product, paper and photos inside it.</p>

        <div className="mt-space-lg">
          <div className="flex items-end justify-between">
            <label htmlFor="name" className="mb-1.5 block text-label-lg text-navy">
              Event name <span className="text-primary-container">*</span>
            </label>
            <span className="mb-1.5 text-body-sm text-secondary">{name.length}/32</span>
          </div>
          <input
            id="name"
            autoFocus
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya & Arun Wedding"
            className={`h-11 w-full rounded-lg border bg-surface-container-low px-4 text-body-lg text-navy outline-none transition focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20 ${error ? 'border-error' : 'border-surface-container-high'}`}
          />
          {error && (
            <p role="alert" className="mt-1.5 text-body-md text-error">
              {error}
            </p>
          )}
        </div>

        <button
          disabled={busy}
          className="mt-space-lg flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-container text-label-lg text-white shadow-lg shadow-primary-container/30 transition hover:bg-[#b3205a] active:bg-[#8f1d3f] disabled:opacity-60"
        >
          {busy ? <Spinner /> : null} Create Event {!busy && <Icon name="arrow_forward" />}
        </button>
      </form>
    </div>
  );
}
