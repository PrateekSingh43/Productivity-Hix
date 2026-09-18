import React from "react";

interface PriorityItem {
  id?: string;
  text: string;
}

interface PriorityListProps {
  priorities: Array<string | PriorityItem>;
  emptyMessage?: string;
  className?: string;
}

export function PriorityList({
  priorities,
  emptyMessage = "No priorities defined",
  className = "",
}: PriorityListProps) {
  if (priorities.length === 0) {
    return (
      <p className="text-xs text-text-tertiary italic py-1">{emptyMessage}</p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      {priorities.map((item, idx) => {
        const text = typeof item === "string" ? item : item.text;
        const key = typeof item === "string" ? idx : item.id ?? idx;
        const indexNumber = (idx + 1).toString().padStart(2, "0");

        return (
          <div
            key={key}
            className="flex items-start gap-2.5 p-2 rounded-[var(--radius-sm)] bg-bg-secondary border border-border-subtle/60 text-xs"
          >
            <span className="font-mono text-[10px] text-accent-default font-semibold pt-0.5 shrink-0">
              {indexNumber}
            </span>
            <span className="text-text-primary leading-relaxed">{text}</span>
          </div>
        );
      })}
    </div>
  );
}
