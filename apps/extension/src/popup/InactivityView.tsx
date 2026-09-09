import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Coffee, Send, ArrowLeft } from "lucide-react";
import { submitCheckIn } from "../api/client";

export function InactivityView({
  onComplete,
  onCancel,
  isStandalone,
}: {
  onComplete: () => void;
  onCancel?: () => void;
  isStandalone?: boolean;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");

  const handleFinish = () => {
    try {
      if (typeof window !== "undefined") {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "PRODUCTIVEHIX_CLOSE_MODAL" }, "*");
        }
        if (isStandalone) {
          window.close();
        }
      }
    } catch {}
    onComplete();
  };

  const submit = useMutation({
    mutationFn: async () => {
      if (!reason.trim()) return;
      return submitCheckIn({
        eventType: "AWAY_REVIEW",
        activityAssessment: "AWAY",
        note: reason.trim(),
        reasons: [],
        questionVersion: "",
        source: ""
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["extension-status"] });
      handleFinish();
    },
  });

  return (
    <main className="content" style={{ gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0" }}>
        <button
          type="button"
          onClick={onCancel || onComplete}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            background: "transparent",
            border: 0,
            color: "var(--text-muted)",
            fontSize: 11,
            cursor: "pointer",
            padding: 0,
          }}
        >
          <ArrowLeft size={13} /> Back
        </button>
      </div>

      <div className="section-heading compact">
        <div>
          <span className="section-kicker">INACTIVITY</span>
          <h1>Welcome back.</h1>
        </div>
      </div>

      <section className="hero-card">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--accent-primary)" }}>
            <Coffee size={18} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-primary)" }}>
              You were inactive for a while.
            </span>
          </div>
          
          <p style={{ fontSize: 11.5, color: "var(--text-secondary)", margin: 0, lineHeight: 1.4 }}>
            ProductiveHix detected a long gap in your activity outside of your sleep schedule. What was the reason?
          </p>

          <div style={{ position: "relative" }}>
            <textarea
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              placeholder="e.g., Went for a walk, took a lunch break, read a book..."
              disabled={submit.isPending}
              style={{
                width: "100%",
                minHeight: 120,
                background: "var(--bg-surface-elevated)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "10px",
                color: "var(--text-primary)",
                fontSize: 12,
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              fontSize: 10,
              color: reason.length >= 500 ? "var(--danger)" : "var(--text-muted)"
            }}>
              {reason.length}/500
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button
              type="button"
              className="secondary-button"
              onClick={handleFinish}
              disabled={submit.isPending}
              style={{ flex: 1, marginTop: 0 }}
            >
              Skip
            </button>
            <button
              type="button"
              className="primary-button"
              onClick={() => submit.mutate()}
              disabled={submit.isPending || !reason.trim()}
              style={{ flex: 1, marginTop: 0 }}
            >
              {submit.isPending ? "Saving..." : "Save Reason"} <Send size={12} />
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
