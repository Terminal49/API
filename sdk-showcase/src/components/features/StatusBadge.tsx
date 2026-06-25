import { cn, containerStatusConfig } from '@/lib/utils';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config = containerStatusConfig[status] || {
    label: status,
    color: 'text-slate-600',
    bgColor: 'bg-slate-100',
    description: 'Unknown status',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium',
        config.bgColor,
        config.color,
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'
      )}
      title={config.description}
    >
      <span className="w-1 h-1 rounded-full bg-current opacity-70" />
      {config.label}
    </span>
  );
}
