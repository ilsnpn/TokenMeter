'use client';

import { Card, CardContent } from '@/components/ui/card';
import { type LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: LucideIcon;
  trend?: string;
  compact?: boolean;
}

export function StatCard({ title, value, subtitle, icon: Icon, trend, compact }: StatCardProps) {
  return (
    <Card className={`stat-card border-border shadow-none ${compact ? 'gap-0 py-0' : ''}`}>
      <CardContent className={compact ? 'px-4 py-3' : 'p-5'}>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
            <p className="text-2xl font-bold tracking-tight">{value}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
            {trend && (
              <p className="text-xs font-medium text-primary">{trend}</p>
            )}
          </div>
          <div className="rounded-md border border-border p-2">
            <Icon className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
