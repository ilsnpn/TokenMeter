'use client';

import { type ReactNode } from 'react';
import { useDataVersion } from '@/lib/hooks';
import { Sidebar } from '@/components/layout/sidebar';
import { Landing } from '@/components/landing';

// Until a folder is loaded in this tab, every route shows the landing page.
export function AppShell({ children }: { children: ReactNode }) {
  const version = useDataVersion();
  if (!version) return <Landing />;
  return (
    <>
      <Sidebar />
      <main className="dash ml-60 min-h-screen">
        <div className="mx-auto max-w-7xl px-6 py-6">
          {children}
        </div>
      </main>
    </>
  );
}
