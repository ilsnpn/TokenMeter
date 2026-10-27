import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface Costed { model: string; name: string; color: string; cost: number }

/** Keeps the `n` costliest entries and folds the rest into one "Autres" row, so long model lists stay one screen tall. */
export function topWithOthers<T extends Costed>(items: T[], n: number, sum: (a: T, b: T) => T): T[] {
  const sorted = [...items].sort((a, b) => b.cost - a.cost);
  if (sorted.length <= n + 1) return sorted;
  const rest = sorted.slice(n).reduce(sum);
  return [
    ...sorted.slice(0, n),
    { ...rest, model: 'other', name: `Autres (${sorted.length - n})`, color: 'var(--chart-5)' },
  ];
}
