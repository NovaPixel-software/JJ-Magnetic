'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import SupportLink, { withSupportLink } from '@/components/SupportLink';
import { Icon, Spinner } from '@/components/ui';

const BITS = ['❤️', '💖', '💗', '✨', '🎉', '🌸', '💕'];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** A burst of hearts and confetti from the middle of an element, for a moment of celebration. */
function celebrate(from: HTMLElement | null) {
  if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const r = from.getBoundingClientRect();
  const x0 = r.left + r.width / 2;
  const y0 = r.top + r.height / 2;
  for (let i = 0; i < 46; i++) {
    const el = document.createElement('span');
    el.className = 'love-confetti';
    el.textContent = BITS[Math.floor(rnd(0, BITS.length))];
    el.style.fontSize = `${rnd(14, 30)}px`;
    document.body.appendChild(el);
    const a = rnd(-Math.PI * 0.95, -Math.PI * 0.05);
    const v = rnd(180, 520);
    const dx = Math.cos(a) * v;
    const dy = Math.sin(a) * v;
    el.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(.4) rotate(0deg)`, opacity: 1 },
        { transform: `translate(${x0 + dx}px, ${y0 + dy}px) scale(1) rotate(${rnd(-200, 200)}deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${x0 + dx * 1.15}px, ${y0 + dy + 340}px) scale(.8) rotate(${rnd(-360, 360)}deg)`, opacity: 0 },
      ],
      { duration: rnd(1500, 2400), easing: 'cubic-bezier(.2,.7,.3,1)' },
    ).onfinish = () => el.remove();
  }
}

export default function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [error, setError] = useState<{ code?: string; message: string } | null>(null);
  const button = useRef<HTMLButtonElement>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email.trim() || !password) {
      setError({ code: 'MISSING', message: 'Enter your email and password.' });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { redirectTo } = await api.login(email.trim(), password);
      // a short celebration before the page changes
      setWelcome(true);
      celebrate(button.current);
      await new Promise((r) => setTimeout(r, 1000));
      router.replace(redirectTo);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError) setError({ code: err.code, message: err.message });
      else setError({ message: 'Cannot reach the server. Check your connection and try again.' });
      setBusy(false);
    }
  };

  // An inactive or expired account is not a typing mistake, so it gets a calmer amber box instead of red.
  const inactive = error?.code === 'INACTIVE' || error?.code === 'EXPIRED';
  const bad = error && !inactive ? 'bad' : '';

  return (
    <form onSubmit={submit} noValidate className="love-card">
      <div className="love-medal">
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/jj-logo.png" alt="JJ Magnetic Memories" />
        </div>
      </div>

      {error && (
        <div
          key={error.message}
          role="alert"
          className={`love-shake mb-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-body-md ${inactive ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-[#f6c3c9] bg-[#fff0f1] text-[#c62839]'}`}
        >
          <Icon name={error.code === 'EXPIRED' ? 'event_busy' : inactive ? 'block' : 'error'} className="!text-[18px]" fill />
          <span>{withSupportLink(error.message)}</span>
        </div>
      )}

      <div className="relative mb-3.5">
        <input
          id="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          aria-label="Email"
          className={`love-input ${bad}`}
        />
        <Icon name="mail" className="love-lead" />
      </div>

      <div className="relative">
        <input
          id="password"
          type={show ? 'text' : 'password'}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          aria-label="Password"
          className={`love-input ${bad}`}
        />
        <Icon name="lock" className="love-lead" />
        <button type="button" onClick={() => setShow((v) => !v)} aria-label={show ? 'Hide password' : 'Show password'} className="love-eye">
          <Icon name={show ? 'visibility_off' : 'visibility'} className="!text-[20px]" />
        </button>
      </div>

      <button ref={button} type="submit" disabled={busy} className="love-btn">
        {welcome ? (
          'Welcome back!'
        ) : busy ? (
          <>
            <Spinner className="h-5 w-5" /> Signing in…
          </>
        ) : (
          <>
            <span className="love-hrt">♥</span> Sign in
          </>
        )}
      </button>

      <div className="love-sep">♥</div>
      <p className="text-center text-body-md text-secondary">
        Need help? <SupportLink />
      </p>
    </form>
  );
}
