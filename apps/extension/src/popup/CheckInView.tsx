import { useState, useMemo, useEffect } from "react";
import { CheckCircle2, ArrowLeft, ArrowRight, X, Sparkles } from "lucide-react";
import type { Task, CheckInPatternCandidate } from "@repo/types";
import { submitCheckIn } from "../api/client";

function Step6Confirmation({
  offlineQueued,
  isStandalone,
  onComplete,
  notifyClose,
}: {
  offlineQueued: boolean;
  isStandalone?: boolean;
  onComplete: () => void;
  notifyClose: () => void;
}) {
  useEffect(() => {
    // Auto-close / auto-advance after 1.8 seconds
    const timer = setTimeout(() => {
      notifyClose();
      onComplete();
    }, 1800);
    return () => clearTimeout(timer);
  }, [notifyClose, onComplete]);

  return (
    <main className="content" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "20px 10px" }}>
      <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--success-subtle)", display: "grid", placeItems: "center", color: "var(--success)", marginBottom: 12 }}>
        <CheckCircle2 size={24} />
      </div>
      <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "var(--text-primary)" }}>
        {offlineQueued ? "Saved Offline" : "Check-in Saved"}
      </h2>
      <p style={{ fontSize: 11, color: "var(--text-secondary)", margin: "0 0 16px", maxWidth: 260 }}>
        {offlineQueued
          ? "Your reflection is securely queued locally and will sync when reconnected."
          : "Your intentional reflection has been recorded."}
      </p>

      {isStandalone ? (
        <div style={{ display: "flex", gap: 8, width: "100%", maxWidth: 280, marginTop: 4 }}>
          <button
            type="button"
            className="secondary-button"
            style={{ flex: 1, marginTop: 0 }}
            onClick={onComplete}
          >
            View Today
          </button>
          <button
            type="button"
            className="primary-button"
            style={{ flex: 1, marginTop: 0 }}
            onClick={() => {
              notifyClose();
              onComplete();
            }}
          >
            Done & Close
          </button>
        </div>
      ) : (
        <button
          className="primary-button"
          style={{ minWidth: 140 }}
          onClick={() => {
            notifyClose();
            onComplete();
          }}
        >
          Continue to Today
        </button>
      )}
    </main>
  );
}

interface CheckInViewProps {
  currentTask?: Task | null;
  patterns?: CheckInPatternCandidate[];
  onComplete: () => void;
  onCancel: () => void;
  onSwitchToInactivity?: () => void;
  isStandalone?: boolean;
}

const ASSESSMENTS = [
  { id: "productive", label: "Productive" },
  { id: "learning", label: "Learning" },
  { id: "deep_focus", label: "Deep focus" },
  { id: "useful_not_productive", label: "Useful, not productive" },
  { id: "distracted", label: "Distracted" },
  { id: "break", label: "Break" },
] as const;

const ALIGNMENTS = [
  { id: "yes", label: "Yes" },
  { id: "partly", label: "Partly" },
  { id: "no", label: "No" },
] as const;

const BLOCKER_REASONS = [
  { id: "distracted", label: "Distracted" },
  { id: "task_unclear", label: "Task unclear" },
  { id: "too_difficult", label: "Too difficult" },
  { id: "low_motivation", label: "Low motivation" },
  { id: "didnt_feel_like_it", label: "Didn't feel like it" },
  { id: "technically_stuck", label: "Technically stuck" },
  { id: "unexpected_interruption", label: "Unexpected interruption" },
  { id: "switched_priorities", label: "Switched priorities" },
] as const;

const EMOTIONAL_STATES = [
  { id: "calm", label: "Calm" },
  { id: "neutral", label: "Neutral" },
  { id: "happy", label: "Happy" },
  { id: "motivated", label: "Motivated" },
  { id: "sleepy", label: "Sleepy" },
  { id: "stressed", label: "Stressed" },
  { id: "anxious", label: "Anxious" },
  { id: "frustrated", label: "Frustrated" },
  { id: "angry", label: "Angry" },
] as const;

const ENERGY_LEVELS = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

const FOCUS_LEVELS = [
  { id: "scattered", label: "Scattered" },
  { id: "mixed", label: "Mixed" },
  { id: "focused", label: "Focused" },
] as const;

export function CheckInView({
  currentTask,
  patterns = [],
  onComplete,
  onCancel,
  onSwitchToInactivity,
  isStandalone,
}: CheckInViewProps) {
  const notifyClose = () => {
    try {
      if (typeof window !== "undefined") {
        if (window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "PRODUCTIVEHIX_CLOSE_MODAL" }, "*");
        }
        window.close();
      }
    } catch {}
  };

  // Wizard steps: 1: Assessment, 2: Alignment, 3: Blockers (conditional), 4: State/Energy, 5: Note, 6: Done
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(1);
  const [assessment, setAssessment] = useState<string | null>(null);
  const [alignment, setAlignment] = useState<string | null>(null);
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [state, setState] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [deeperAnswers, setDeeperAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [offlineQueued, setOfflineQueued] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isBreak = assessment === "break";
  const shouldAskBlocker = !isBreak && (alignment === "partly" || alignment === "no" || assessment === "distracted");

  // Determine active deeper reflection candidate
  const activeDeeperQuestion = useMemo(() => {
    for (const r of selectedReasons) {
      const candidate = patterns.find((p) => p.reason === r && p.deeperEligible && p.deeperQuestion);
      if (candidate?.deeperQuestion) {
        return candidate.deeperQuestion;
      }
    }
    return null;
  }, [selectedReasons, patterns]);

  const toggleReason = (id: string) => {
    setSelectedReasons((prev) =>
      prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id],
    );
  };

  const handleAssessmentSelect = (id: string) => {
    setAssessment(id);
    if (id === "break") {
      // Break skips alignment and blocker steps
      setStep(4);
    } else {
      setStep(2);
    }
  };

  const handleAlignmentSelect = (id: string) => {
    setAlignment(id);
    if (id === "no" || id === "partly" || assessment === "distracted") {
      setStep(3); // Show blocker question
    } else {
      setStep(4); // Skip blocker question for good hours
    }
  };

  const handleSubmit = async () => {
    if (!assessment) return;

    setSubmitting(true);
    setError(null);

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const payload = {
      windowStart: oneHourAgo.toISOString(),
      windowEnd: now.toISOString(),
      taskId: currentTask?.id ?? null,
      activityAssessment: assessment,
      alignment: isBreak ? null : (alignment ?? "yes"),
      reasons: isBreak ? [] : selectedReasons,
      state: state ?? "neutral",
      energy: energy ?? "medium",
      focus: focus ?? "focused",
      note: note.trim().slice(0, 500) || null,
      questionVersion: "v1",
      source: "extension_hourly",
      eventType: "PERIODIC",
      deeperAnswers: Object.keys(deeperAnswers).length > 0 ? deeperAnswers : null,
    };

    try {
      const res = await submitCheckIn(payload);
      if (res.success) {
        setOfflineQueued(Boolean(res.queuedOffline));
        setStep(6);
      } else {
        setError(res.error || "Failed to submit check-in");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // Step 6: Confirmation
  if (step === 6) {
    return (
      <Step6Confirmation
        offlineQueued={offlineQueued}
        isStandalone={isStandalone}
        onComplete={onComplete}
        notifyClose={notifyClose}
      />
    );
  }

  // Calculate total visible steps
  const totalSteps = shouldAskBlocker ? 5 : 4;
  const currentStepDisplay = step > 3 && !shouldAskBlocker ? step - 1 : step;

  return (
    <main className="content" style={{ gap: 12 }}>
      {/* Top Header: Cancel / Step Progress */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 0" }}>
        <button
          type="button"
          onClick={() => {
            if (step === 1) {
              if (isStandalone) notifyClose();
              else onCancel();
            }
            else if (step === 4 && isBreak) setStep(1);
            else if (step === 4 && !shouldAskBlocker) setStep(2);
            else setStep((prev) => Math.max(1, prev - 1) as any);
          }}
          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: 0, color: "var(--text-muted)", fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          <ArrowLeft size={13} /> {step === 1 ? "Cancel" : "Back"}
        </button>

        <span style={{ fontSize: 10, color: "var(--accent-primary)", fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Step {currentStepDisplay} of {totalSteps}
        </span>

        <button
          type="button"
          onClick={isStandalone ? notifyClose : onCancel}
          style={{ background: "transparent", border: 0, color: "var(--text-muted)", padding: 0, cursor: "pointer" }}
          title="Exit check-in"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 10px", background: "var(--danger-subtle)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 8, fontSize: 11, color: "var(--danger)" }}>
          {error}
        </div>
      )}

      {/* STEP 1: Assessment */}
      {step === 1 && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>HOURLY CHECK-IN</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 12px", color: "var(--text-primary)" }}>How did the last hour go?</h2>
          {currentTask && (
            <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-secondary)" }}>
              Target task: <strong style={{ color: "var(--text-primary)" }}>{currentTask.title}</strong>
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            {ASSESSMENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="secondary-button"
                onClick={() => handleAssessmentSelect(item.id)}
                style={{
                  marginTop: 0,
                  padding: "10px 8px",
                  fontSize: 11,
                  textAlign: "center",
                  justifyContent: "center",
                  background: assessment === item.id ? "var(--bg-active)" : undefined,
                  borderColor: assessment === item.id ? "var(--accent-primary)" : undefined,
                  color: assessment === item.id ? "var(--accent-primary)" : undefined,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>

          {onSwitchToInactivity && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button
                type="button"
                onClick={onSwitchToInactivity}
                style={{
                  background: "transparent",
                  border: 0,
                  color: "var(--text-secondary)",
                  fontSize: 11,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                Were you away from the computer? Review inactivity
              </button>
            </div>
          )}
        </section>
      )}

      {/* STEP 2: Alignment */}
      {step === 2 && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>INTENTIONALITY</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 12px", color: "var(--text-primary)" }}>
            {currentTask ? "Were you working on what you intended?" : "Did this block feel intentional?"}
          </h2>
          <div style={{ display: "flex", gap: 6 }}>
            {ALIGNMENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                className="secondary-button"
                onClick={() => handleAlignmentSelect(item.id)}
                style={{
                  flex: 1,
                  marginTop: 0,
                  padding: "12px 6px",
                  fontSize: 11,
                  textAlign: "center",
                  justifyContent: "center",
                  background: alignment === item.id ? "var(--bg-active)" : undefined,
                  borderColor: alignment === item.id ? "var(--accent-primary)" : undefined,
                  color: alignment === item.id ? "var(--accent-primary)" : undefined,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* STEP 3: Conditional Blocker Question */}
      {step === 3 && shouldAskBlocker && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "var(--warning)" }}>ADAPTIVE REFLECTION</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 10px", color: "var(--text-primary)" }}>What got in the way?</h2>
          <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: "0 0 10px" }}>Select any that apply:</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {BLOCKER_REASONS.map((item) => {
              const active = selectedReasons.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleReason(item.id)}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    border: `1px solid ${active ? "var(--warning)" : "var(--border-subtle)"}`,
                    background: active ? "var(--warning-subtle)" : "var(--bg-subtle)",
                    color: active ? "var(--warning)" : "var(--text-secondary)",
                    fontSize: 10.5,
                    cursor: "pointer",
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {/* Longitudinal Deeper Reflection Prompt */}
          {activeDeeperQuestion && (
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "var(--accent-subtle)", border: "1px solid var(--accent-border)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "var(--accent-primary)", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                <Sparkles size={12} /> RECURRING PATTERN
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--text-primary)" }}>{activeDeeperQuestion.prompt}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {activeDeeperQuestion.options.map((opt, i) => {
                  const sel = deeperAnswers[activeDeeperQuestion.id] === opt;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setDeeperAnswers((prev) => ({ ...prev, [activeDeeperQuestion.id]: opt }))}
                      style={{
                        padding: "5px 8px",
                        textAlign: "left",
                        borderRadius: 6,
                        border: `1px solid ${sel ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                        background: sel ? "var(--accent-subtle)" : "transparent",
                        color: sel ? "var(--text-primary)" : "var(--text-secondary)",
                        fontSize: 10.5,
                      }}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button className="primary-button full" style={{ marginTop: 14 }} onClick={() => setStep(4)}>
            Next <ArrowRight size={13} />
          </button>
        </section>
      )}

      {/* STEP 4: State, Energy & Focus */}
      {step === 4 && (
        <section className="reflect-card" style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>STATE OF MIND</span>
            <h2 style={{ fontSize: 14, margin: "4px 0 8px", color: "var(--text-primary)" }}>Primary state</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {EMOTIONAL_STATES.map((item) => {
                const active = state === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setState(item.id)}
                    style={{
                      padding: "5px 9px",
                      borderRadius: 999,
                      border: `1px solid ${active ? "var(--accent-primary)" : "var(--border-subtle)"}`,
                      background: active ? "var(--accent-subtle)" : "var(--bg-subtle)",
                      color: active ? "var(--accent-primary)" : "var(--text-secondary)",
                      fontSize: 10.5,
                      cursor: "pointer",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>ENERGY LEVEL</span>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {ENERGY_LEVELS.map((item) => {
                const active = energy === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="secondary-button"
                    onClick={() => setEnergy(item.id)}
                    style={{
                      flex: 1,
                      marginTop: 0,
                      padding: "6px 2px",
                      fontSize: 10.5,
                      textAlign: "center",
                      justifyContent: "center",
                      background: active ? "var(--bg-active)" : undefined,
                      borderColor: active ? "var(--accent-primary)" : undefined,
                      color: active ? "var(--accent-primary)" : undefined,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>FOCUS LEVEL</span>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {FOCUS_LEVELS.map((item) => {
                const active = focus === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className="secondary-button"
                    onClick={() => setFocus(item.id)}
                    style={{
                      flex: 1,
                      marginTop: 0,
                      padding: "6px 2px",
                      fontSize: 10.5,
                      textAlign: "center",
                      justifyContent: "center",
                      background: active ? "var(--bg-active)" : undefined,
                      borderColor: active ? "var(--accent-primary)" : undefined,
                      color: active ? "var(--accent-primary)" : undefined,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button className="primary-button full" style={{ marginTop: 6 }} onClick={() => setStep(5)}>
            Next <ArrowRight size={13} />
          </button>
        </section>
      )}

      {/* STEP 5: Optional Note (0 / 500) */}
      {step === 5 && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "var(--accent-primary)" }}>OPTIONAL NOTE</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 6px", color: "var(--text-primary)" }}>Anything else?</h2>
          <p style={{ fontSize: 10.5, color: "var(--text-secondary)", margin: "0 0 10px" }}>
            Add brief context about this block (max 500 characters):
          </p>

          <div style={{ position: "relative" }}>
            <textarea
              value={note}
              maxLength={500}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="e.g. Cleared difficult bug in router"
              rows={4}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface-elevated)",
                color: "var(--text-primary)",
                fontSize: 11,
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ textAlign: "right", fontSize: 9.5, color: note.length >= 500 ? "var(--danger)" : "var(--text-muted)", marginTop: 4 }}>
              {note.length} / 500
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              type="button"
              className="primary-button"
              style={{ flex: 1, marginTop: 0 }}
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? "Saving..." : note.trim().length > 0 ? "Save Check-In" : "Skip & Save"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
