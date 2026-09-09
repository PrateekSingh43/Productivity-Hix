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
  default: "bg-bg-secondary text-text-muted border-border-subtle",
  neutral: "bg-bg-secondary text-text-secondary border-border-subtle",
  accent: "bg-text-primary/10 text-text-primary border-border-subtle",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  error: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  outline: "bg-transparent text-text-muted border-border-subtle",
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
