import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  kicker?: string;
  breadcrumbs?: BreadcrumbItem[];
  dateContext?: string;
  action?: React.ReactNode;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  subtitle,
  kicker,
  breadcrumbs,
  dateContext,
  action,
  actions,
  children,
  className = "",
}: PageHeaderProps) {
  const headerActions = actions ?? action;

  return (
    <div
      className={`flex flex-col gap-2 pb-5 border-b border-border-subtle ${className}`}
    >
      {/* Optional Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-text-muted">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-text-primary transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={
                      isLast
                        ? "text-text-primary font-medium"
                        : "text-text-muted"
                    }
                    aria-current={isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight className="w-3 h-3 text-text-muted/50" aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-3">
        <div className="space-y-1 min-w-0">
          {kicker && (
            <span className="text-[11px] font-medium tracking-wide text-text-muted uppercase">
              {kicker}
            </span>
          )}
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
              {title}
            </h1>
            {dateContext && (
              <span className="text-xs text-text-secondary px-2 py-0.5 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle font-mono">
                {dateContext}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {headerActions && (
          <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
            {headerActions}
          </div>
        )}
      </div>

      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
