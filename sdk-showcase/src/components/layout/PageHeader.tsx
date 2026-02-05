import Link from 'next/link';

interface Breadcrumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <header className="bg-kumo-base border-b border-kumo-line px-5 py-3">
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-1">
          <ol className="flex items-center gap-1.5 text-xs text-kumo-muted">
            {breadcrumbs.map((crumb, index) => (
              <li key={crumb.label} className="flex items-center gap-1.5">
                {index > 0 && <span className="text-kumo-line">/</span>}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-kumo-link transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-kumo-secondary">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      {/* Title and Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-kumo-default">{title}</h1>
          {description && (
            <p className="text-xs text-kumo-muted mt-0.5">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
