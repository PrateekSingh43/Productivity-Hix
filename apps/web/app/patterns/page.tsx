import { BaselinePlaceholder } from "../../components/layout/baseline-placeholder";

export default function PatternsPage() {
  return (
    <BaselinePlaceholder
      title="Patterns"
      subtitle="Evidence-Based Behavioral Rules"
      concept="Synthesizes concrete evidence from your historical work sessions, uncovering true distraction triggers, velocity patterns, and blocker correlations."
      metricsNeeded="14+ days of correlation signals"
      previewItems={[
        { label: "Morning Session Output", value: "+34% task completion" },
        { label: "Context Switch Penalty", value: "14m recovery time" },
        { label: "Predictive Energy Peak", value: "10:15 AM" },
      ]}
    />
  );
}
