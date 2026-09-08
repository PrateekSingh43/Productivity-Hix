import { useState, useMemo } from "react";
import { CheckCircle2, ArrowLeft, ArrowRight, X, Sparkles } from "lucide-react";
import type { Task, CheckInPatternCandidate } from "@repo/types";
import { submitCheckIn } from "../api/client";

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
  { id: "stressed", label: "Stressed" },
  { id: "anxious", label: "Anxious" },
  { id: "frustrated", label: "Frustrated" },
  { id: "motivated", label: "Motivated" },
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
      note: note.trim().slice(0, 350) || null,
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
      <main className="content" style={{ justifyContent: "center", alignItems: "center", textAlign: "center", padding: "20px 10px" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", background: "rgba(52,211,153,0.15)", display: "grid", placeItems: "center", color: "#34d399", marginBottom: 12 }}>
          <CheckCircle2 size={24} />
        </div>
        <h2 style={{ fontSize: 16, margin: "0 0 6px", color: "#f7f3fc" }}>
          {offlineQueued ? "Saved Offline" : "Check-in Saved"}
        </h2>
        <p style={{ fontSize: 11, color: "#948ca2", margin: "0 0 16px", maxWidth: 260 }}>
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
              onClick={notifyClose}
            >
              Done & Close
            </button>
          </div>
        ) : (
          <button className="primary-button" style={{ minWidth: 140 }} onClick={onComplete}>
            Continue to Today
          </button>
        )}
      </main>
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
          style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "transparent", border: 0, color: "#90869e", fontSize: 11, cursor: "pointer", padding: 0 }}
        >
          <ArrowLeft size={13} /> {step === 1 ? "Cancel" : "Back"}
        </button>

        <span style={{ fontSize: 10, color: "#a78bfa", fontWeight: 650, letterSpacing: ".08em", textTransform: "uppercase" }}>
          Step {currentStepDisplay} of {totalSteps}
        </span>

        <button
          type="button"
          onClick={isStandalone ? notifyClose : onCancel}
          style={{ background: "transparent", border: 0, color: "#90869e", padding: 0, cursor: "pointer" }}
          title="Exit check-in"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div style={{ padding: "8px 10px", background: "rgba(244,63,94,0.12)", border: "1px solid rgba(244,63,94,0.25)", borderRadius: 8, fontSize: 11, color: "#ffc6cf" }}>
          {error}
        </div>
      )}

      {/* STEP 1: Assessment */}
      {step === 1 && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "#a78bfa" }}>HOURLY CHECK-IN</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 12px", color: "#faf7ff" }}>How did the last hour go?</h2>
          {currentTask && (
            <p style={{ margin: "0 0 12px", fontSize: 11, color: "#948ca2" }}>
              Target task: <strong style={{ color: "#f5f0fb" }}>{currentTask.title}</strong>
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
                  background: assessment === item.id ? "rgba(139,92,246,0.3)" : undefined,
                  borderColor: assessment === item.id ? "#a78bfa" : undefined,
                  color: assessment === item.id ? "#faf7ff" : undefined,
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
                  color: "#948ca2",
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
          <span className="section-kicker" style={{ color: "#a78bfa" }}>INTENTIONALITY</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 12px", color: "#faf7ff" }}>
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
                  background: alignment === item.id ? "rgba(139,92,246,0.3)" : undefined,
                  borderColor: alignment === item.id ? "#a78bfa" : undefined,
                  color: alignment === item.id ? "#faf7ff" : undefined,
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
          <span className="section-kicker" style={{ color: "#fbbf24" }}>ADAPTIVE REFLECTION</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 10px", color: "#faf7ff" }}>What got in the way?</h2>
          <p style={{ fontSize: 10.5, color: "#948ca2", margin: "0 0 10px" }}>Select any that apply:</p>
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
                    border: `1px solid ${active ? "#fbbf24" : "rgba(255,255,255,0.1)"}`,
                    background: active ? "rgba(251,191,36,0.18)" : "rgba(255,255,255,0.03)",
                    color: active ? "#fef3c7" : "#c4bdd4",
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
            <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(167,139,250,0.22)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, color: "#d8c6ff", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>
                <Sparkles size={12} /> RECURRING PATTERN
              </div>
              <p style={{ margin: "0 0 8px", fontSize: 11, color: "#f5f0fb" }}>{activeDeeperQuestion.prompt}</p>
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
                        border: `1px solid ${sel ? "#a78bfa" : "rgba(255,255,255,0.08)"}`,
                        background: sel ? "rgba(139,92,246,0.25)" : "transparent",
                        color: sel ? "#faf7ff" : "#b0a8c2",
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
            <span className="section-kicker" style={{ color: "#a78bfa" }}>STATE OF MIND</span>
            <h2 style={{ fontSize: 14, margin: "4px 0 8px", color: "#faf7ff" }}>Primary state</h2>
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
                      border: `1px solid ${active ? "#a78bfa" : "rgba(255,255,255,0.1)"}`,
                      background: active ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.03)",
                      color: active ? "#faf7ff" : "#c4bdd4",
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
            <span className="section-kicker" style={{ color: "#a78bfa" }}>ENERGY LEVEL</span>
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
                      background: active ? "rgba(139,92,246,0.25)" : undefined,
                      borderColor: active ? "#a78bfa" : undefined,
                      color: active ? "#faf7ff" : undefined,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="section-kicker" style={{ color: "#a78bfa" }}>FOCUS LEVEL</span>
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
                      background: active ? "rgba(139,92,246,0.25)" : undefined,
                      borderColor: active ? "#a78bfa" : undefined,
                      color: active ? "#faf7ff" : undefined,
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

      {/* STEP 5: Optional Note (0 / 350) */}
      {step === 5 && (
        <section className="reflect-card" style={{ padding: 14 }}>
          <span className="section-kicker" style={{ color: "#a78bfa" }}>OPTIONAL NOTE</span>
          <h2 style={{ fontSize: 15, margin: "6px 0 6px", color: "#faf7ff" }}>Anything else?</h2>
          <p style={{ fontSize: 10.5, color: "#948ca2", margin: "0 0 10px" }}>
            Add brief context about this block (max 350 characters):
          </p>

          <div style={{ position: "relative" }}>
            <textarea
              value={note}
              maxLength={350}
              onChange={(e) => setNote(e.target.value.slice(0, 350))}
              placeholder="e.g. Cleared difficult bug in router"
              rows={4}
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(0,0,0,0.25)",
                color: "#f5f0fb",
                fontSize: 11,
                fontFamily: "inherit",
                resize: "none",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
            <div style={{ textAlign: "right", fontSize: 9.5, color: note.length >= 350 ? "#fb7171" : "#81798d", marginTop: 4 }}>
              {note.length} / 350
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
