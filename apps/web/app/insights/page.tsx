import { BaselinePlaceholder } from "../../components/layout/baseline-placeholder";

export default function InsightsPage() {
  return (
    <BaselinePlaceholder
      title="Insights"
      subtitle="Behavioral Analytics & Trends"
      concept="Aggregates long-term productivity patterns, identifying optimal focus windows, application distributions, and cognitive rhythm over 7, 30, and 90-day spans."
      metricsNeeded="7+ days of continuous telemetry"
      previewItems={[
        { label: "Optimal Focus Window", value: "09:00 – 12:30" },
        { label: "Cognitive Fatigue Point", value: "After 75 mins" },
        { label: "Deep Work Ratio", value: "68% of active time" },
      ]}
    />
  );
}
