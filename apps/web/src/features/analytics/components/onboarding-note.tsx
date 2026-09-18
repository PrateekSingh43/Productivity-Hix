import React from "react";

export function OnboardingNote({ message }: { message: { title: string; detail: string } }) {
  return (
    <div role="status" className="space-y-2 rounded-xl border border-border-subtle bg-bg-card p-5 sm:p-6">
      <h2 className="text-base font-medium text-text-primary">{message.title}</h2>
      <p className="text-sm text-text-secondary">{message.detail}</p>
    </div>
  );
}
