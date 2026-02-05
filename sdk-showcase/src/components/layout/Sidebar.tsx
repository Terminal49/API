'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ThemeToggle } from '@/components/theme-toggle';

interface NavItem {
  label: string;
  href: string;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  { label: 'Dashboard', href: '/' },
  {
    label: 'Tracking',
    href: '/tracking-requests',
    children: [
      { label: 'Requests', href: '/tracking-requests' },
      { label: 'New Request', href: '/tracking-requests/new' },
    ],
  },
  {
    label: 'Shipments',
    href: '/shipments',
    children: [{ label: 'All Shipments', href: '/shipments' }],
  },
  {
    label: 'Containers',
    href: '/containers',
    children: [{ label: 'All Containers', href: '/containers' }],
  },
  {
    label: 'Reference',
    href: '/shipping-lines',
    children: [
      { label: 'Shipping Lines', href: '/shipping-lines' },
      { label: 'Webhooks', href: '/webhooks' },
    ],
  },
  { label: 'Search', href: '/search' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 h-screen bg-kumo-base border-r border-kumo-line flex flex-col">
      {/* Logo */}
      <div className="px-4 py-3 border-b border-kumo-line flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-kumo-accent flex items-center justify-center">
            <span className="text-white text-xs font-bold">T49</span>
          </div>
          <span className="text-sm font-semibold text-kumo-default">SDK Showcase</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2 px-2">
        <ul className="space-y-0.5">
          {navigation.map((item) => (
            <li key={item.href}>
              {item.children ? (
                <div className="mb-1">
                  <div className="px-2 py-1.5 text-xs font-medium text-kumo-muted uppercase tracking-wider">
                    {item.label}
                  </div>
                  <ul className="space-y-0.5">
                    {item.children.map((child) => (
                      <li key={child.href}>
                        <Link
                          href={child.href}
                          className={cn(
                            'flex items-center px-2 py-1.5 text-sm rounded transition-colors',
                            pathname === child.href
                              ? 'bg-kumo-accent text-white font-medium'
                              : 'text-kumo-secondary hover:text-kumo-default hover:bg-kumo-recessed'
                          )}
                        >
                          {child.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center px-2 py-1.5 text-sm rounded transition-colors',
                    pathname === item.href
                      ? 'bg-kumo-accent text-white font-medium'
                      : 'text-kumo-secondary hover:text-kumo-default hover:bg-kumo-recessed'
                  )}
                >
                  {item.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-kumo-line">
        <p className="text-xs text-kumo-muted">
          @terminal49/sdk
        </p>
      </div>
    </aside>
  );
}
