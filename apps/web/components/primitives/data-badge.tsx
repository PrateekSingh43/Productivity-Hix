import React from "react";

export type BadgeVariant =
  | "default"
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "error"
  | "outline";

interface DataBadgeProps {
  children?: React.ReactNode;
  label?: string;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  className?: string;
  icon?: React.ComponentType<{ size?: number; className?: string }>;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-[var(--background-subtle)] text-[var(--foreground-muted)] border-[var(--border-subtle)]",
  neutral: "bg-[var(--background-subtle)] text-[var(--foreground-muted)] border-[var(--border-subtle)]",
  accent: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
  success: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  warning: "bg-amber-500/10 text-amber-400 border-amber-500/30",
  error: "bg-red-500/10 text-red-400 border-red-500/30",
  outline: "bg-transparent text-[var(--foreground-muted)] border-[var(--border-subtle)]",
};

const sizeStyles = {
  sm: "text-[10px] px-1.5 py-0.5 rounded",
  md: "text-xs px-2 py-0.5 rounded-md",
};

export function DataBadge({
  children,
  label,
  variant = "default",
  size = "sm",
  className = "",
  icon: Icon,
}: DataBadgeProps) {
  const content = children ?? label;

  return (
    <span
      className={`inline-flex items-center gap-1 font-medium border ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
    >
      {Icon && <Icon size={size === "sm" ? 11 : 13} className="shrink-0" aria-hidden="true" />}
      <span>{content}</span>
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const norm = priority.toLowerCase();
  let variant: BadgeVariant = "default";

  if (norm === "urgent" || norm === "p1") variant = "error";
  else if (norm === "high" || norm === "p2") variant = "warning";
  else if (norm === "medium" || norm === "p3") variant = "accent";
  else if (norm === "low") variant = "default";

  return <DataBadge variant={variant}>{priority.toUpperCase()}</DataBadge>;
}

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const norm = outcome.toLowerCase();
  let variant: BadgeVariant = "default";

  if (norm === "achieved") variant = "success";
  else if (norm === "partially achieved" || norm === "partially_achieved") variant = "warning";
  else if (norm === "not achieved" || norm === "not_achieved") variant = "error";
  else variant = "default";

  return <DataBadge variant={variant}>{outcome}</DataBadge>;
}
