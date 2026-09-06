import { BaselinePlaceholder } from "../../components/layout/baseline-placeholder";

export default function LearningPage() {
  return (
    <BaselinePlaceholder
      title="Learning"
      subtitle="Knowledge Retention & Topics"
      concept="Tracks knowledge mastery across technical topics, measuring how well concepts studied in documentation or coding sessions are retained over time."
      metricsNeeded="Completed learning reviews"
      previewItems={[
        { label: "Active Topics", value: "8 tracked" },
        { label: "Mean Retention Rate", value: "82% recall" },
        { label: "Next Scheduled Block", value: "TanStack v5 Review" },
      ]}
    />
  );
}
