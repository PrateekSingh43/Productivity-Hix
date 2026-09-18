"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import type { AnalyticsEvidenceRef, RecordingHistory } from "../types";
import { dateLabel, timelineHref } from "../lib/presentation";

export const MINIMUM_DAYS_FOR_FINDINGS = 7;

export function onboardingMessage(history: RecordingHistory | undefined): { title: string; detail: string } | null {
  if (!history) return null;
  const days = Math.max(0, history.recordedDays);
  if (days >= MINIMUM_DAYS_FOR_FINDINGS) {
    return {
      title: "Building your first findings",
      detail: "Comparable work from around seven recorded days is needed before a finding can be checked. Keep collecting activity and reflect as usual.",
    };
  }
  return {
    title: "Keep recording — findings need about seven days",
    detail: `${days} of about 7 days recorded so far. Nothing is judged in the meantime; the checks simply wait for comparable evidence.`,
  };
}

export function EvidenceLink({ evidence }: { evidence?: AnalyticsEvidenceRef }) {
  const href = evidence ? timelineHref(evidence.date) : null;
  return href ? (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-1 text-sm text-text-secondary underline underline-offset-4 hover:text-text-primary"
    >
      View evidence
      <ArrowUpRight size={14} aria-hidden="true" />
    </Link>
  ) : null;
}

export function EvidenceRows({
  evidence,
  relatedPatterns,
}: {
  evidence: AnalyticsEvidenceRef[];
  relatedPatterns?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-text-primary">Evidence</h3>
      {evidence.length === 0 ? (
        <p>Evidence links were not provided.</p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {evidence.map((ref, index) => {
            const href = timelineHref(ref.date);
            return (
              <li
                key={`${ref.occasionId}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <div className="space-y-1">
                  <p>{dateLabel(ref.date)}</p>
                  {relatedPatterns}
                </div>
                {href && (
                  <Link
                    href={href}
                    className="inline-flex min-h-11 items-center gap-1 text-text-primary underline underline-offset-4"
                    aria-label={`Open timeline for ${dateLabel(ref.date)}`}
                  >
                    Open timeline
                    <ArrowUpRight size={13} aria-hidden="true" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="font-medium text-text-primary">{title}</h3>
      {children}
    </div>
  );
}
