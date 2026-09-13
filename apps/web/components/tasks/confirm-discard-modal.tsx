"use client";

import React from "react";
import { Trash2 } from "lucide-react";

interface ConfirmDiscardModalProps {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function ConfirmDiscardModal({
  isOpen,
  onConfirm,
  onCancel,
  isPending = false,
}: ConfirmDiscardModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="discard-modal-title"
    >
      <div className="w-full max-w-sm rounded-xl border border-border-default bg-bg-card p-5 shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          <div className="h-9 w-9 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
            <Trash2 size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h3
              id="discard-modal-title"
              className="text-sm font-semibold text-text-primary"
            >
              Discard Focus Session?
            </h3>
            <p className="mt-1 text-xs text-text-muted leading-relaxed">
              This will cancel the active session and remove the elapsed time from your history and analytics. This action cannot be undone.
            </p>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-border-subtle bg-bg-secondary text-text-primary hover:bg-bg-active hover:border-border-strong transition-colors disabled:opacity-50"
          >
            Keep Working
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 hover:border-red-500/40 hover:text-red-300 transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Trash2 size={12} />
            {isPending ? "Discarding..." : "Discard Session"}
          </button>
        </div>
      </div>
    </div>
  );
}
