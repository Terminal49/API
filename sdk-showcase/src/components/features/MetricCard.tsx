import Link from 'next/link';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: number | string;
  icon: string;
  href?: string;
  trend?: {
    value: number;
    direction: 'up' | 'down' | 'neutral';
  };
  variant?: 'default' | 'warning' | 'success';
}

export function MetricCard({
  title,
  value,
  icon,
  href,
  trend,
  variant = 'default',
}: MetricCardProps) {
  const variantStyles = {
    default: 'border-kumo-line',
    warning: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800',
    success: 'border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800',
  };

  const content = (
    <div
      className={cn(
        'px-4 py-3 rounded-lg border bg-kumo-base transition-all',
        variantStyles[variant],
        href && 'hover:border-kumo-focus cursor-pointer'
      )}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-kumo-muted font-medium uppercase tracking-wide">{title}</p>
          <p className="text-xl font-semibold text-kumo-default mt-0.5 tabular-nums">
            {value}
          </p>
          {trend && (
            <p
              className={cn(
                'text-xs mt-0.5 tabular-nums',
                trend.direction === 'up' && 'text-emerald-600',
                trend.direction === 'down' && 'text-red-600',
                trend.direction === 'neutral' && 'text-kumo-muted'
              )}
            >
              {trend.direction === 'up' && '↑ '}
              {trend.direction === 'down' && '↓ '}
              {trend.value}%
            </p>
          )}
        </div>
        <span className="text-lg ml-2 opacity-60">{icon}</span>
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}
