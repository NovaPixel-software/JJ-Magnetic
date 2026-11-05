'use client';

import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { Icon, Spinner } from '@/components/ui';

export default function ChangePasswordForm({ onDone }: { onDone?: () => void }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDone(false);
    if (next !== confirm) return setError('The new passwords do not match.');
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
    } finally {
      setBusy(false);
    }
  };

  const input =
    'h-10 w-full rounded-lg border border-surface-container-high bg-surface-container-low px-3 text-body-lg outline-none focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20';

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block">
        <span className="mb-1 block text-label-lg text-navy">Current password</span>
        <input className={input} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label className="block">
        <span className="mb-1 block text-label-lg text-navy">New password</span>
        <input className={input} type="password" autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} required />
        <span className="mt-1 block text-body-sm text-secondary">At least 8 characters.</span>
      </label>
      <label className="block">
        <span className="mb-1 block text-label-lg text-navy">Confirm new password</span>
        <input className={input} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
      </label>

      {error && (
        <p role="alert" className="rounded-lg bg-error-container/50 px-3 py-2 text-body-md text-on-error-container">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-body-md text-emerald-800">
          <Icon name="check_circle" className="!text-[18px]" fill /> Password changed.
        </p>
      )}

      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-primary-container px-5 text-label-lg text-white hover:bg-[#b3205a] disabled:opacity-60">
        {busy && <Spinner className="h-4 w-4" />} Change password
      </button>
    </form>
  );
}
