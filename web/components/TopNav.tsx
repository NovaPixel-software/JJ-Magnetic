'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import ProfileMenu from './ProfileMenu';
import { BrandBar, Icon } from './ui';

interface Props {
  user: { name: string; email: string };
}

export default function TopNav({ user }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  const logout = async () => {
    await api.logout().catch(() => {});
    router.replace('/login');
    router.refresh();
  };

  const onEvents = pathname === '/events' || (pathname.startsWith('/events/') && pathname !== '/events/new');
  const links = (
    <>
      <Link
        href="/events"
        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-label-lg transition-colors md:py-2 ${onEvents ? 'bg-white/15 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'}`}
      >
        <Icon name="event" className="!text-[18px] md:hidden" /> My Events
      </Link>
    </>
  );

  return (
    <header className="sticky top-0 z-30 border-b border-white/25 bg-gradient-to-r from-[#9d2a56] via-[#c23a6c] to-[#e2688f] shadow-md shadow-[#c23a6c]/20">
      <div className="mx-auto flex max-w-[1360px] h-14 items-center gap-4 px-gutter-mobile md:h-auto md:px-margin md:py-3">
        <Link href="/events" className="shrink-0">
          <BrandBar dark />
        </Link>

        <nav className="flex items-center gap-1 md:ml-2">{links}</nav>

        <div className="ml-auto flex items-center gap-2">
          <ProfileMenu
            dark
            name={user.name}
            email={user.email}
            items={[
              { label: 'Settings', icon: 'settings', href: '/settings' },
              { label: 'Log out', icon: 'logout', onClick: logout, danger: true },
            ]}
          />
        </div>
      </div>

    </header>
  );
}
