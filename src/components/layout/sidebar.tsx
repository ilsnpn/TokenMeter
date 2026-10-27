'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { clearFiles } from '@/lib/claude-data/vfs';
import {
  LayoutDashboard,
  FolderKanban,
  MessageSquare,
  DollarSign,
  TrendingUp,
  Upload,
  FileDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Items with a `section` live on the one-page home; the others are separate pages.
const navItems = [
  { section: 'overview', href: '/#overview', label: 'Overview', icon: LayoutDashboard },
  { section: 'costs', href: '/#costs', label: 'Costs', icon: DollarSign },
  { section: 'value', href: '/#value', label: 'Value', icon: TrendingUp },
  { section: 'projects', href: '/#projects', label: 'Projects', icon: FolderKanban },
  { section: 'sessions', href: '/#sessions', label: 'Sessions', icon: MessageSquare },
];

/** On the home page: which section is in view, and how far through it (0–1). */
function useScrollSpy(enabled: boolean) {
  const [state, setState] = useState<{ id: string; progress: number }>({ id: 'overview', progress: 0 });
  useEffect(() => {
    if (!enabled) return;
    const onScroll = () => {
      const probe = window.innerHeight * 0.382;
      for (const el of document.querySelectorAll<HTMLElement>('#onepage > section')) {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) {
          const progress = Math.min(Math.max((probe - r.top) / r.height, 0), 1);
          setState({ id: el.id, progress });
          return;
        }
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [enabled]);
  return state;
}

export function Sidebar() {
  const pathname = usePathname();
  const onHome = pathname === '/';
  const spy = useScrollSpy(onHome);
  const navRef = useRef<HTMLElement>(null);
  const router = useRouter();

  // Prints the whole one-page home; from another page, go there first.
  const exportPdf = () => {
    if (onHome) return window.print();
    router.push('/');
    setTimeout(() => window.print(), 1500);
  };

  // Keep the active item visible when the menu itself is taller than the screen.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [spy.id]);

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-screen w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
        <Logo />
        <div>
          <h1 className="text-sm font-semibold tracking-tight">TokenMeter</h1>
          <p className="text-[10px] text-muted-foreground">Claude Code · Codex · Gemini</p>
        </div>
      </div>

      <nav ref={navRef} className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const isActive = item.section
            ? (onHome ? spy.id === item.section : pathname === `/${item.section}` || pathname.startsWith(`/${item.section}/`))
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive}
              className={cn(
                'relative flex items-center gap-3 overflow-hidden rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-foreground shadow-[inset_2px_0_0_var(--primary)] [&>svg]:text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {isActive && onHome && item.section && (
                <span
                  className="absolute bottom-0 left-0 h-px bg-primary transition-[width] duration-150"
                  style={{ width: `${spy.progress * 100}%` }}
                />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <ThemeToggle className="mb-3" />
        <button
          onClick={exportPdf}
          className="mb-2 flex w-full items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <FileDown className="h-3 w-3" />
          Exporter en PDF
        </button>
        <button
          onClick={clearFiles}
          className="flex w-full items-center gap-2 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
        >
          <Upload className="h-3 w-3" />
          Charger d&apos;autres données
        </button>
        <p className="mt-1 text-[10px] text-muted-foreground">Analysé dans ce navigateur uniquement</p>
      </div>
    </aside>
  );
}
