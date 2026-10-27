'use client';

import { useEffect, useState } from 'react';
import { useValueStats } from '@/lib/hooks';
import { StatCard } from '@/components/cards/stat-card';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCostFull, formatTokensFull } from '@/lib/format';
import { Coins, Code2, FileCode, Terminal, TrendingUp } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList,
} from 'recharts';

interface Assumptions {
  subscription: number; // $ per month actually paid
  linesPerHour: number; // productive lines a developer writes by hand
  hourlyRate: number;   // loaded cost of a developer hour
}

const DEFAULTS: Assumptions = { subscription: 200, linesPerHour: 30, hourlyRate: 80 };
const KEY = 'value-assumptions';

function useAssumptions() {
  const [a, setA] = useState<Assumptions>(DEFAULTS);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      // Read after mount so server and client render the same markup.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setA({ ...DEFAULTS, ...JSON.parse(saved) });
    } catch { /* keep defaults */ }
  }, []);
  const update = (patch: Partial<Assumptions>) => {
    const next = { ...a, ...patch };
    setA(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* not persisted */ }
  };
  return [a, update] as const;
}

const n = (v: number) => Math.round(v).toLocaleString('en-US');

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(y, mo - 1).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

const tooltipStyle = {
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: '8px',
  fontSize: '12px',
};

export default function ValuePage() {
  const { data: v, isLoading } = useValueStats();
  const [a, update] = useAssumptions();

  if (isLoading || !v) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const paid = a.subscription * Math.max(v.activeMonths, 1);
  const multiplier = paid > 0 ? v.apiCost / paid : 0;
  const hoursSaved = a.linesPerHour > 0 ? v.linesWritten / a.linesPerHour : 0;
  const laborValue = hoursSaved * a.hourlyRate;
  const months = v.months.map(m => ({ ...m, label: monthLabel(m.month) }));
  const period = v.firstDate && `${new Date(v.firstDate).toLocaleDateString('fr-FR')} → ${new Date(v.lastDate).toLocaleDateString('fr-FR')}`;

  return (
    <div className="space-y-6">
      <div className="slide space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Value</h1>
          <p className="text-sm text-muted-foreground">Ce que vos agents de code ont produit, et ce que cela aurait coûté</p>
        </div>
      </div>

      {/* Executive summary */}
      <Card className="gap-2 border-2 border-primary/40 py-4 shadow-sm">
        <CardHeader className="pb-0">
          <CardTitle className="title-lg font-semibold">Résumé</CardTitle>
          <p className="text-xs text-muted-foreground">{period} · {v.activeDays} jours actifs · {n(v.sessions)} sessions</p>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-6 pt-0">
          <div>
            <p className="text-4xl font-bold tracking-tight text-primary">×{multiplier.toFixed(1)}</p>
            <p className="mt-1 text-sm">valeur au tarif API vs abonnement payé</p>
            <p className="text-xs text-muted-foreground">{formatCostFull(v.apiCost)} de valeur pour {formatCostFull(paid)} payés</p>
          </div>
          <div>
            <p className="text-4xl font-bold tracking-tight">{n(hoursSaved)} h</p>
            <p className="mt-1 text-sm">de développement estimées</p>
            <p className="text-xs text-muted-foreground">soit {formatCostFull(laborValue)} à {a.hourlyRate} $/h</p>
          </div>
          <div>
            <p className="text-4xl font-bold tracking-tight">{n(v.linesWritten)}</p>
            <p className="mt-1 text-sm">lignes de code écrites</p>
            <p className="text-xs text-muted-foreground">dans {n(v.filesTouched)} fichiers</p>
          </div>
        </CardContent>
      </Card>

      {/* Code produced */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard title="Lignes écrites" value={formatTokensFull(v.linesWritten)} subtitle={`${n(v.linesRemoved)} lignes remplacées`} compact icon={Code2} />
        <StatCard title="Fichiers modifiés" value={formatTokensFull(v.filesTouched)} compact icon={FileCode} />
        <StatCard title="Commandes lancées" value={formatTokensFull(v.commandsRun)} subtitle={`${n(v.toolCalls)} actions au total`} compact icon={Terminal} />
        <StatCard title="Valeur au tarif API" value={formatCostFull(v.apiCost)} compact icon={Coins} />
      </div>

      {/* Projection & simulation */}
      <Card className="border-border/50 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="title-lg font-semibold">Projection et simulation</CardTitle>
          <p className="text-xs text-muted-foreground">
            Ce que vous avez payé, ce que la même consommation coûterait au tarif API, et ce que le travail aurait coûté à la main.
          </p>
          <div className="no-print mt-3 grid grid-cols-3 gap-4 rounded-lg bg-muted/40 p-3">
            {([
              ['subscription', 'Abonnement payé ($ / mois)'],
              ['linesPerHour', 'Lignes écrites à la main par heure'],
              ['hourlyRate', 'Coût d’une heure de développeur ($)'],
            ] as const).map(([key, label]) => (
              <label key={key} className="space-y-1">
                <span className="text-xs text-muted-foreground">{label}</span>
                <input
                  type="number"
                  min={0}
                  value={a[key]}
                  onChange={e => update({ [key]: Number(e.target.value) })}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </label>
            ))}
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-[1.4fr_1fr] gap-8 pt-2">
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={[
                  { name: 'Payé', value: paid, fill: 'var(--muted-foreground)' },
                  { name: 'Tarif API', value: v.apiCost, fill: 'var(--primary)' },
                  { name: 'Sans IA', value: laborValue, fill: 'var(--foreground)' },
                ]}
                margin={{ top: 5, right: 90, left: 5, bottom: 5 }}
              >
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(x) => [formatCostFull(Number(x)), 'Coût']} cursor={false} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={34}>
                  <LabelList dataKey="value" position="right" formatter={(x) => formatCostFull(Number(x))} style={{ fontSize: 13, fontWeight: 700, fill: 'var(--foreground)' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-4">
            <div>
              <p className="text-3xl font-bold tracking-tight text-primary">×{n(paid > 0 ? laborValue / paid : 0)}</p>
              <p className="text-sm">coût à la main vs coût réellement payé</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Temps à la main</p>
                <p className="text-lg font-bold">{n(hoursSaved)} h</p>
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Temps passé avec l’agent</p>
                <p className="text-lg font-bold">{n(v.activeHours)} h</p>
              </div>
            </div>
            <p className="text-sm">
              Gain estimé : <span className="font-bold">{n(Math.max(hoursSaved - v.activeHours, 0))} h</span>
              {v.activeHours > 0 && <> · <span className="font-bold text-primary">×{(hoursSaved / v.activeHours).toFixed(1)}</span> plus rapide</>}
            </p>
            <p className="text-xs text-muted-foreground">
              Le tarif API est le prix public d’Anthropic, pas son coût interne, que personne ne publie. Le temps
              passé additionne l’activité des sessions, sans les pauses de plus de 30 minutes. Les lignes comptées
              sont celles écrites par les outils Write et Edit : un ordre de grandeur, pas une mesure.
            </p>
          </div>
        </CardContent>
      </Card>

      </div>
      <div className="slide space-y-6">
      {/* Monthly trend */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <TrendingUp className="h-4 w-4 text-primary" /> Valeur par mois (tarif API)
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[240px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(x) => `$${n(x)}`} />
                <Tooltip contentStyle={tooltipStyle} formatter={(x) => [formatCostFull(Number(x)), 'Valeur']} />
                <Bar dataKey="apiCost" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="border-border/50 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-semibold">
              <Code2 className="h-4 w-4 text-primary" /> Lignes écrites par mois
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[240px] pt-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={months} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} axisLine={false} tickLine={false} tickFormatter={(x) => n(x)} />
                <Tooltip contentStyle={tooltipStyle} formatter={(x) => [n(Number(x)), 'Lignes']} />
                <Bar dataKey="linesWritten" fill="var(--primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      </div>
    </div>
  );
}
