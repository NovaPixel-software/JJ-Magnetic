import LogoLoader from '@/components/LogoLoader';

// Shown in place of the page while the next one is being made on the server.
export default function Loading() {
  return <LogoLoader className="min-h-[55vh]" label="Loading…" />;
}
