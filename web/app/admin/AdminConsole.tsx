'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import ChangePasswordForm from '@/components/ChangePasswordForm';
import Dropdown from '@/components/Dropdown';
import ProfileMenu from '@/components/ProfileMenu';
import { BrandBar, Icon, Initials, Spinner } from '@/components/ui';
import { ApiError, api, type PublicUser } from '@/lib/api';

type State = 'active' | 'inactive' | 'expired';
type Tab = 'all' | State;

const NO_STATS = { events: 0, downloads: 0, prints: 0 };
const statsOf = (u: PublicUser) => u.stats ?? NO_STATS;

/** What a user is right now. Expired wins over active/inactive, because they cannot sign in either way. */
const stateOf = (u: PublicUser): State => (u.expired ? 'expired' : u.status);

/* ---- dates (YYYY-MM-DD strings) ---- */
const todayLocal = () => new Date().toLocaleDateString('en-CA');
const fmt = (iso: string) => new Date(iso.slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, dim));
  return t.toISOString().slice(0, 10);
}

function ago(iso: string | null): string {
  if (!iso) return 'Never';
  const mins = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 2) return 'Just now';
  if (mins < 60) return `${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'Yesterday' : `${days} days ago`;
}

const genPassword = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return [...bytes].map((b) => chars[b % chars.length]).join('');
};

const inputClass =
  'h-10 w-full rounded-lg border border-surface-container-high bg-surface-container-low px-3 text-body-lg outline-none focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20';

export default function AdminConsole({ initialUsers, me }: { initialUsers: PublicUser[]; me: { name: string; email: string } }) {
  const router = useRouter();
  const [users, setUsers] = useState(initialUsers);
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'add' | 'myPassword' | { edit: PublicUser } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const count = (s: State) => users.filter((u) => stateOf(u) === s).length;
  const totals = users.reduce(
    (t, u) => ({ events: t.events + statsOf(u).events, downloads: t.downloads + statsOf(u).downloads, prints: t.prints + statsOf(u).prints }),
    { events: 0, downloads: 0, prints: 0 },
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users
      .filter((u) => tab === 'all' || stateOf(u) === tab)
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, tab, query]);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const replace = (user: PublicUser) => setUsers((prev) => prev.map((x) => (x.id === user.id ? user : x)));

  const setStatus = async (u: PublicUser, status: 'active' | 'inactive') => {
    setPending(u.id);
    try {
      const { user } = await api.updateUser(u.id, { status });
      replace(user);
      flash(status === 'active' ? `${u.name} is now active.` : `${u.name} is now inactive and cannot sign in.`);
    } catch (e) {
      flash(e instanceof ApiError ? e.message : 'Could not reach the server.');
    } finally {
      setPending(null);
    }
  };

  const logout = async () => {
    await api.logout().catch(() => {});
    router.replace('/login');
    router.refresh();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'all', label: `All (${users.length})` },
    { id: 'active', label: `Active (${count('active')})` },
    { id: 'inactive', label: `Inactive (${count('inactive')})` },
    { id: 'expired', label: `Expired (${count('expired')})` },
  ];

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-surface-container-high bg-surface-container-lowest/95 px-gutter-mobile py-3 backdrop-blur md:px-margin">
        <div className="flex min-w-0 items-center gap-3">
          <BrandBar className="shrink-0" />
          <span className="shrink-0 rounded border border-primary-container/50 bg-primary-container/10 px-2 py-0.5 text-label-sm text-primary-container">ADMIN</span>
        </div>
        <ProfileMenu
          name={me.name}
          email={me.email}
          items={[
            { label: 'My password', icon: 'key', onClick: () => setDialog('myPassword') },
            { label: 'Log out', icon: 'logout', onClick: logout, danger: true },
          ]}
        />
      </header>

      <main className="mx-auto max-w-6xl space-y-space-lg px-gutter-mobile py-space-lg md:px-margin">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-headline-lg text-navy sm:text-display">Users</h1>
            <p className="mt-2 max-w-2xl text-body-lg text-secondary">
              Add and edit users, set when each account expires, and switch them active or inactive. Inactive and expired users cannot sign in.
            </p>
          </div>
          <button
            onClick={() => setDialog('add')}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-5 text-label-lg text-white shadow-lg shadow-primary-container/30 hover:bg-[#b3205a] sm:w-auto"
          >
            <Icon name="person_add" className="!text-[20px]" /> Add user
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <TotalCard icon="group" label="Users" value={users.length} note={`${count('active')} active`} />
          <TotalCard icon="event" label="Events" value={totals.events} note="created by all users" />
          <TotalCard icon="download" label="Downloads" value={totals.downloads} note="sheets downloaded" />
          <TotalCard icon="print" label="Prints" value={totals.prints} note="sheets printed" />
        </div>

        <section className="rounded-2xl border border-surface-container-high bg-surface-container-lowest shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-surface-container p-4">
            <div className="flex flex-wrap gap-1 rounded-xl bg-surface-container p-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`rounded-lg px-3 py-2 text-label-lg transition ${tab === t.id ? 'bg-white text-primary-container shadow-sm' : 'text-secondary hover:text-navy'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-80">
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or email…"
                className="h-10 w-full rounded-lg border border-surface-container-high bg-surface-container-low pl-10 pr-3 text-body-md outline-none focus:border-tertiary-container focus:ring-[3px] focus:ring-tertiary-container/20"
              />
            </div>
          </div>

          {/* phones: one card per user */}
          <ul className="divide-y divide-surface-container md:hidden">
            {filtered.map((u) => {
              const s = stateOf(u);
              return (
                <li key={u.id} className={`space-y-3 p-4 ${s === 'active' ? '' : 'bg-surface-container-low/60'}`}>
                  <div className="flex items-center gap-3">
                    <Initials name={u.name} className="h-10 w-10 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-label-lg text-navy">{u.name}</p>
                      <p className="truncate text-body-md text-secondary">{u.email}</p>
                    </div>
                    <StatusPill state={s} />
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-md">
                    <div>
                      <dt className="text-secondary">Created</dt>
                      <dd className="text-navy">{fmt(u.createdAt)}</dd>
                    </div>
                    <div>
                      <dt className="text-secondary">Expires</dt>
                      <dd>
                        <Expiry u={u} />
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-secondary">Last login</dt>
                      <dd className="text-navy">{ago(u.lastLogin)}</dd>
                    </div>
                  </dl>
                  <div className="grid grid-cols-3 divide-x divide-surface-container rounded-lg border border-surface-container text-center">
                    <MiniStat label="Events" value={statsOf(u).events} />
                    <MiniStat label="Downloads" value={statsOf(u).downloads} />
                    <MiniStat label="Prints" value={statsOf(u).prints} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <EditButton onClick={() => setDialog({ edit: u })} className="h-10" />
                    <StatusButton on={u.status === 'active'} busy={pending === u.id} onClick={() => setStatus(u, u.status === 'active' ? 'inactive' : 'active')} className="h-10" />
                  </div>
                </li>
              );
            })}
            {filtered.length === 0 && <li className="px-4 py-12 text-center text-secondary">{users.length === 0 ? 'No users yet. Add the first one.' : 'No users match this view.'}</li>}
          </ul>

          {/* tablet and up: a table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-left text-body-lg">
              <thead className="bg-surface-container-low text-label-md text-secondary">
                <tr>
                  {['User', 'Status', 'Created', 'Expires', 'Events', 'Downloads', 'Prints', 'Last login', 'Actions'].map((h, i) => (
                    <th key={h} className={`whitespace-nowrap px-4 py-3 font-semibold ${i >= 4 && i <= 6 ? 'text-right' : ''} ${i === 8 ? 'text-right' : ''}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {filtered.map((u) => {
                  const s = stateOf(u);
                  return (
                    <tr key={u.id} className={s === 'active' ? '' : 'bg-surface-container-low/60'}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Initials name={u.name} className="h-10 w-10" />
                          <div className="min-w-0">
                            <p className="truncate text-label-lg text-navy">{u.name}</p>
                            <p className="truncate text-body-md text-secondary">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <StatusPill state={s} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-navy">{fmt(u.createdAt)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <Expiry u={u} />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{statsOf(u).events}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{statsOf(u).downloads}</td>
                      <td className="px-4 py-3 text-right font-semibold text-navy">{statsOf(u).prints}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-navy">{ago(u.lastLogin)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <EditButton onClick={() => setDialog({ edit: u })} className="px-3 py-2" />
                          <StatusButton on={u.status === 'active'} busy={pending === u.id} onClick={() => setStatus(u, u.status === 'active' ? 'inactive' : 'active')} className="min-w-[130px] py-2" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-secondary">
                      {users.length === 0 ? 'No users yet. Add the first one.' : 'No users match this view.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {dialog === 'add' && (
        <AddUserDialog
          onClose={() => setDialog(null)}
          onCreated={(user) => {
            setUsers((prev) => [...prev, user]);
            setDialog(null);
            flash(`${user.name} added. Expires ${fmt(user.expiresAt ?? '')}.`);
          }}
        />
      )}
      {dialog && typeof dialog === 'object' && (
        <EditUserDialog
          user={dialog.edit}
          onClose={() => setDialog(null)}
          onSaved={(user) => {
            replace(user);
            setDialog(null);
            flash(`${user.name} updated.`);
          }}
        />
      )}
      {dialog === 'myPassword' && (
        <Modal title="Change my password" onClose={() => setDialog(null)}>
          <ChangePasswordForm />
        </Modal>
      )}

      {toast && <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full bg-navy px-5 py-3 text-label-lg text-white shadow-xl">{toast}</div>}
    </div>
  );
}

function TotalCard({ icon, label, value, note }: { icon: string; label: string; value: number; note: string }) {
  return (
    <div className="rounded-2xl border border-surface-container-high bg-surface-container-lowest p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-label-md uppercase tracking-wider text-secondary">{label}</p>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-container text-tertiary">
          <Icon name={icon} className="!text-[18px]" />
        </span>
      </div>
      <p className="mt-2 text-[28px] font-bold leading-none text-navy">{value.toLocaleString('en-IN')}</p>
      <p className="mt-1 text-body-sm text-secondary">{note}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2">
      <p className="text-label-lg text-navy">{value}</p>
      <p className="text-body-sm text-secondary">{label}</p>
    </div>
  );
}

/** The expiry date, with how long is left under it. */
function Expiry({ u }: { u: PublicUser }) {
  if (!u.expiresAt || u.daysLeft === null) return <span className="text-secondary">Never</span>;
  const left = u.daysLeft;
  const note = left < 0 ? `Expired ${-left} day${-left === 1 ? '' : 's'} ago` : left === 0 ? 'Last day today' : `${left} day${left === 1 ? '' : 's'} left`;
  const tone = left < 0 ? 'text-error' : left <= 30 ? 'text-amber-700' : 'text-secondary';
  return (
    <span className="block leading-tight">
      <span className={left < 0 ? 'text-error' : 'text-navy'}>{fmt(u.expiresAt)}</span>
      <span className={`block text-body-sm ${tone}`}>{note}</span>
    </span>
  );
}

function StatusPill({ state }: { state: State }) {
  const look = {
    active: { box: 'border-emerald-200 bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500', label: 'Active' },
    inactive: { box: 'border-surface-container-high bg-surface-container text-secondary', dot: 'bg-secondary', label: 'Inactive' },
    expired: { box: 'border-error-container bg-error-container/50 text-error', dot: 'bg-error', label: 'Expired' },
  }[state];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-label-md ${look.box}`}>
      <span className={`h-2 w-2 rounded-full ${look.dot}`} /> {look.label}
    </span>
  );
}

function EditButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-surface-container-high text-label-md text-primary-container hover:bg-surface-container-low ${className}`}
    >
      <Icon name="edit" className="!text-[16px]" /> Edit
    </button>
  );
}

function StatusButton({ on, busy, onClick, className = '' }: { on: boolean; busy: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-label-md disabled:opacity-60 ${on ? 'bg-surface-container text-navy hover:bg-surface-container-high' : 'bg-primary-container text-white hover:bg-[#b3205a]'} ${className}`}
    >
      {busy ? <Spinner className="h-4 w-4" /> : <Icon name={on ? 'block' : 'check_circle'} className="!text-[16px]" />}
      {on ? 'Make inactive' : 'Make active'}
    </button>
  );
}

function Modal({ title, subtitle, onClose, children }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-md space-y-4 overflow-auto rounded-2xl bg-surface-container-lowest p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h2 className="text-headline-md text-navy">{title}</h2>
            {subtitle && <p className="truncate text-body-md text-secondary">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-secondary hover:bg-surface-container" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function PasswordField({ value, onChange, label, optional }: { value: string; onChange: (v: string) => void; label: string; optional?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-label-lg text-navy">
        {label}
        <button type="button" onClick={() => onChange(genPassword())} className="text-label-md text-primary-container hover:underline">
          Generate
        </button>
      </span>
      <input
        className={`${inputClass} font-mono`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        minLength={value ? 8 : undefined}
        required={!optional}
        placeholder={optional ? 'Leave empty to keep the current password' : ''}
      />
      <span className="mt-1 block text-body-sm text-secondary">
        {optional ? 'Fill this only to reset their password. Share it with them securely.' : 'Share this with the user. They can change it after signing in.'}
      </span>
    </label>
  );
}

/** A date input with quick buttons that add months, counting from `from`. */
function ExpiryField({ value, onChange, from, min }: { value: string; onChange: (v: string) => void; from: string; min?: string }) {
  return (
    <div>
      <label className="block">
        <span className="mb-1 block text-label-lg text-navy">Expires on</span>
        <input className={inputClass} type="date" value={value} min={min} onChange={(e) => onChange(e.target.value)} required />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="text-body-sm text-secondary">Set to</span>
        {[
          ['1 month', 1],
          ['3 months', 3],
          ['6 months', 6],
          ['1 year', 12],
        ].map(([label, months]) => (
          <button
            key={label}
            type="button"
            onClick={() => onChange(addMonths(from, months as number))}
            className="rounded-full border border-surface-container-high px-2.5 py-1 text-label-md text-navy hover:bg-surface-container"
          >
            +{label}
          </button>
        ))}
      </div>
      <p className="mt-1 text-body-sm text-secondary">The account works through this day, then signs out and cannot sign in.</p>
    </div>
  );
}

function Actions({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-3 pt-1">
      <button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-label-lg text-secondary hover:bg-surface-container">
        Cancel
      </button>
      <button disabled={busy} className="flex h-10 items-center gap-2 rounded-lg bg-primary-container px-5 text-label-lg text-white hover:bg-[#b3205a] disabled:opacity-60">
        {busy && <Spinner className="h-4 w-4" />} {label}
      </button>
    </div>
  );
}

const ErrorNote = ({ text }: { text: string }) =>
  text ? (
    <p role="alert" className="rounded-lg bg-error-container/50 px-3 py-2 text-body-md text-on-error-container">
      {text}
    </p>
  ) : null;

function AddUserDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (u: PublicUser) => void }) {
  const today = todayLocal();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [expiresAt, setExpiresAt] = useState(addMonths(today, 12));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { user } = await api.createUser({ name, email, password, expiresAt });
      onCreated(user);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Add user" subtitle="The new user starts as active." onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-label-lg text-navy">Full name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-lg text-navy">Email (their login)</span>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <PasswordField label="Password" value={password} onChange={setPassword} />
        <ExpiryField value={expiresAt} onChange={setExpiresAt} from={today} min={today} />
        <ErrorNote text={error} />
        <Actions busy={busy} onClose={onClose} label="Add user" />
      </form>
    </Modal>
  );
}

function EditUserDialog({ user, onClose, onSaved }: { user: PublicUser; onClose: () => void; onSaved: (u: PublicUser) => void }) {
  const today = todayLocal();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [expiresAt, setExpiresAt] = useState(user.expiresAt ?? addMonths(today, 12));
  const [status, setStatus] = useState<'active' | 'inactive'>(user.status);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Extending an account that is still valid adds to its current end date. An expired one restarts from today.
  const from = user.expiresAt && user.expiresAt >= today ? user.expiresAt : today;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Send only what changed, so saving never overwrites something another admin just edited.
    const body: Parameters<typeof api.updateUser>[1] = {};
    if (name.trim() !== user.name) body.name = name.trim();
    if (email.trim().toLowerCase() !== user.email) body.email = email.trim();
    if (expiresAt !== user.expiresAt) body.expiresAt = expiresAt;
    if (status !== user.status) body.status = status;
    if (password) body.password = password;
    if (Object.keys(body).length === 0) return onClose();

    setBusy(true);
    setError('');
    try {
      const { user: updated } = await api.updateUser(user.id, body);
      onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not reach the server.');
      setBusy(false);
    }
  };

  return (
    <Modal title="Edit user" subtitle={`Created ${fmt(user.createdAt)} · Last login ${ago(user.lastLogin)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {user.expired && (
          <p className="flex items-start gap-2 rounded-lg bg-error-container/50 px-3 py-2 text-body-md text-on-error-container">
            <Icon name="event_busy" className="!text-[18px]" fill /> This account expired on {fmt(user.expiresAt ?? '')}. Pick a new date to let them sign in again.
          </p>
        )}
        <label className="block">
          <span className="mb-1 block text-label-lg text-navy">Full name</span>
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label className="block">
          <span className="mb-1 block text-label-lg text-navy">Email (their login)</span>
          <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <ExpiryField value={expiresAt} onChange={setExpiresAt} from={from} />
        <div className="block">
          <span className="mb-1 block text-label-lg text-navy">Status</span>
          <Dropdown
            value={status}
            onChange={setStatus}
            label="Status"
            options={[
              { value: 'active' as const, label: 'Active' },
              { value: 'inactive' as const, label: 'Inactive (cannot sign in)' },
            ]}
          />
        </div>
        <PasswordField label="New password (optional)" value={password} onChange={setPassword} optional />
        <ErrorNote text={error} />
        <Actions busy={busy} onClose={onClose} label="Save changes" />
      </form>
    </Modal>
  );
}
