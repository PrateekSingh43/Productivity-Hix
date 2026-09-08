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
    if (isStandalone) {
      window.close();
    } else {
      onComplete();
    }
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
            color: "#90869e",
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
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#a78bfa" }}>
            <Coffee size={18} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "#faf7ff" }}>
              You were inactive for a while.
            </span>
          </div>
          
          <p style={{ fontSize: 11.5, color: "#90869e", margin: 0, lineHeight: 1.4 }}>
            ProductiveHix detected a long gap in your activity outside of your sleep schedule. What was the reason?
          </p>

          <div style={{ position: "relative" }}>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 350))}
              placeholder="e.g., Went for a walk, took a lunch break, read a book..."
              disabled={submit.isPending}
              style={{
                width: "100%",
                minHeight: 120,
                background: "#121019",
                border: "1px solid rgba(167,139,250,0.3)",
                borderRadius: 8,
                padding: "10px",
                color: "#faf7ff",
                fontSize: 12,
                resize: "none",
                outline: "none",
              }}
            />
            <div style={{
              position: "absolute",
              bottom: 8,
              right: 10,
              fontSize: 10,
              color: reason.length >= 350 ? "#ef4444" : "#6c667a"
            }}>
              {reason.length}/350
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
