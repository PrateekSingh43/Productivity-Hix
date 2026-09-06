"use client";

import { BookOpen, ArrowRight, Brain } from "lucide-react";
import Link from "next/link";

interface TopicReview {
  id: string;
  topic: string;
  lastReviewed: string;
  recallPercent: number;
  dueToday: boolean;
}

const SAMPLE_REVIEWS: TopicReview[] = [
  {
    id: "topic-1",
    topic: "TanStack React Query v5 Invalidation",
    lastReviewed: "2 days ago",
    recallPercent: 78,
    dueToday: true,
  },
  {
    id: "topic-2",
    topic: "ActivityWatch Bucket Architecture",
    lastReviewed: "4 days ago",
    recallPercent: 86,
    dueToday: true,
  },
  {
    id: "topic-3",
    topic: "Tailwind CSS v4 @theme Directives",
    lastReviewed: "Yesterday",
    recallPercent: 94,
    dueToday: false,
  },
];

export function LearningSnapshot() {
  const dueCount = SAMPLE_REVIEWS.filter((r) => r.dueToday).length;

  return (
    <div className="rounded-[var(--radius-lg)] border border-[#232733] bg-[#111319] p-5 flex flex-col gap-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#8f96a8]">
            Learning & Recall
          </span>
          <span className="text-[#4b5162]">•</span>
          <span className="text-xs text-[#9ca3af] font-medium">
            Spaced Retention
          </span>
        </div>
        <span className="text-[10px] font-medium text-[#707df7] px-1.5 py-0.5 rounded-[var(--radius-sm)] bg-[#707df7]/15 border border-[#707df7]/25">
          {dueCount} due today
        </span>
      </div>

      {/* Topics list */}
      <div className="space-y-2">
        {SAMPLE_REVIEWS.map((review) => (
          <div
            key={review.id}
            className="flex items-center justify-between p-2.5 rounded-[var(--radius-md)] bg-[#0c0d12] border border-[#1d212b]"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-6 w-6 rounded-[var(--radius-sm)] bg-[#181b24] border border-[#2a2f3d] flex items-center justify-center text-[#707df7] shrink-0">
                <Brain size={12} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-medium text-[#f4f4f6] truncate">
                  {review.topic}
                </span>
                <span className="text-[10px] text-[#6b7280]">
                  Reviewed {review.lastReviewed}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="flex flex-col items-end">
                <span className="text-xs font-semibold text-[#f4f4f6]">
                  {review.recallPercent}%
                </span>
                <span className="text-[9px] text-[#6b7280]">recall</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA to /review */}
      <div className="pt-2.5 border-t border-[#1d212b] flex items-center justify-between">
        <span className="text-[11px] text-[#6b7280]">
          Delayed validation engine
        </span>
        <Link
          href="/review"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#707df7] hover:text-[#828ef9] transition-colors"
        >
          Start review <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
