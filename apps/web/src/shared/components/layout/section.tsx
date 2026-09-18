import React from "react";

interface SectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
  className?: string;
  as?: "section" | "div" | "article";
}

export function Section({
  children,
  className = "",
  as: Component = "section",
  ...props
}: SectionProps) {
  return (
    <Component className={`space-y-4 ${className}`} {...props}>
      {children}
    </Component>
  );
}
