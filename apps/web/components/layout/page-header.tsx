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
      className={`flex flex-col gap-3 pb-5 border-b border-[var(--border-subtle)] ${className}`}
    >
      {/* Optional Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-[var(--foreground-muted)]">
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={idx}>
                {crumb.href && !isLast ? (
                  <Link
                    href={crumb.href}
                    className="hover:text-[var(--foreground-primary)] transition-colors"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span
                    className={
                      isLast
                        ? "text-[var(--foreground-primary)] font-medium"
                        : "text-[var(--foreground-muted)]"
                    }
                    aria-current={isLast ? "page" : undefined}
                  >
                    {crumb.label}
                  </span>
                )}
                {!isLast && (
                  <ChevronRight className="w-3 h-3 text-[var(--foreground-muted)]/60" aria-hidden="true" />
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          {kicker && (
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
              {kicker}
            </span>
          )}
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--foreground-primary)]">
              {title}
            </h1>
            {dateContext && (
              <span className="text-xs text-[var(--foreground-muted)] px-2 py-0.5 rounded bg-[var(--background-subtle)] border border-[var(--border-subtle)]">
                {dateContext}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-xs sm:text-sm text-[var(--foreground-muted)] leading-relaxed">
              {subtitle}
            </p>
          )}
        </div>

        {headerActions && (
          <div className="flex items-center gap-2.5 shrink-0">
            {headerActions}
          </div>
        )}
      </div>

      {children && <div className="pt-2">{children}</div>}
    </div>
  );
}
