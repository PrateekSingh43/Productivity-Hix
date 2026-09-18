import React from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export function SectionHeader({
  title,
  description,
  action,
  badge,
  className = "",
}: SectionHeaderProps) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          {badge}
        </div>
        {description && (
          <p className="text-xs text-text-secondary">{description}</p>
        )}
      </div>
      {action && <div className="flex items-center gap-2 shrink-0">{action}</div>}
    </div>
  );
}
