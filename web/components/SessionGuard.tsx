'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { IDLE_MINUTES, PING_EVERY_MS, WARN_SECONDS } from '@/lib/session-config';

/**
 * Keeps the session honest from the browser's side:
 *  - while the person is active it tells the server about once a minute, which keeps the session alive;
 *  - after IDLE_MINUTES with no activity it signs out, and a minute before that it warns;
 *  - if the server says the session is over (inactive too long, or signed in on another device) it goes to the sign-in page.
 * The server checks all of this too, so closing this tab or blocking the script does not keep a session open.
 */
export default function SessionGuard() {
  const router = useRouter();
  const last = useRef(Date.now()); // the last time the person did something
  const pinged = useRef(0); // the last time the server was told
  const [left, setLeft] = useState<number | null>(null); // seconds until sign-out, only during the warning

  useEffect(() => {
    const touch = () => {
      last.current = Date.now();
    };
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;
    events.forEach((e) => addEventListener(e, touch, { passive: true }));

    const end = (reason: 'idle' | 'ended') => {
      router.replace(`/login?reason=${reason}`);
      router.refresh();
    };

    let busy = false;
    const timer = setInterval(async () => {
      const limit = IDLE_MINUTES * 60_000;
      const idle = Date.now() - last.current;
      if (idle >= limit) {
        await api.logout().catch(() => {});
        return end('idle');
      }
      setLeft(idle >= limit - WARN_SECONDS * 1000 ? Math.ceil((limit - idle) / 1000) : null);

      // Tell the server the person is here, if they did something since the last time and a minute has passed.
      if (!busy && last.current > pinged.current && Date.now() - pinged.current >= PING_EVERY_MS) {
        busy = true;
        pinged.current = Date.now();
        try {
          await api.ping();
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) end('ended'); // a network error is ignored, the next try will do
        } finally {
          busy = false;
        }
      }
    }, 1000);

    return () => {
      clearInterval(timer);
      events.forEach((e) => removeEventListener(e, touch));
    };
  }, [router]);

  if (left === null) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-4 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-[#8f1d3f] px-4 py-3 text-white shadow-2xl sm:inset-x-auto sm:right-6">
      <p className="flex-1 text-body-md">
        You will be signed out in <b>{left}s</b> because you have not been active.
      </p>
      <button onClick={() => (last.current = Date.now())} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-label-lg text-[#8f1d3f]">
        Stay signed in
      </button>
    </div>
  );
}
