import { cn } from '@/lib/utils';

interface LogoProps {
  className?: string;
  /** 0–1: the dial fills up like a gauge (used as the loading bar). */
  progress?: number;
  /** Draws the mark in on mount (intro). */
  animated?: boolean;
  /** Stroke scale; lower it on very large renders so lines stay hairline. */
  weight?: number;
}

// 270° dial centred on (16,19), r = 12, open at the bottom.
const ARC = 'M7.51 27.49 A12 12 0 1 1 24.49 27.49';

// TokenMeter mark: a hairline dial, a lime sweep and a fine square-ended needle.
export function Logo({ className, progress, animated, weight = 1 }: LogoProps) {
  const gauge = progress !== undefined;
  // The needle follows the gauge while loading; at rest it points to roughly two-thirds.
  const angle = gauge ? -135 + Math.min(Math.max(progress, 0), 1) * 270 : 45;
  const hub = 1.2 * weight;
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true" className={cn('h-8 w-8', animated && 'logo-intro', className)}>
      <path d={ARC} stroke="var(--border)" strokeWidth={1 * weight} />
      <path
        className="logo-c"
        d={ARC}
        pathLength={100}
        stroke="var(--signal)"
        strokeWidth={2 * weight}
        strokeDasharray={gauge ? `${Math.max(progress, 0.001) * 100} 100` : '70 100'}
      />
      <g transform={`rotate(${angle} 16 19)`}>
        <g className="logo-o">
          <path d="M16 19 L16 9" stroke="var(--foreground)" strokeWidth={1.25 * weight} />
          <rect x={16 - hub / 2} y={19 - hub / 2} width={hub} height={hub} fill="var(--foreground)" />
        </g>
      </g>
    </svg>
  );
}
