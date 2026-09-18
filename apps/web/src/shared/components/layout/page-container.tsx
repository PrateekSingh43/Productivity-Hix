import React from "react";

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  maxWidth?: "sm" | "md" | "lg" | "xl" | "full";
}

const maxWidthMap = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
};

export function PageContainer({
  children,
  className = "",
  maxWidth = "xl",
}: PageContainerProps) {
  return (
    <div
      className={`w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 ${maxWidthMap[maxWidth]} ${className}`}
    >
      {children}
    </div>
  );
}
