import { BaselinePlaceholder } from "../../components/layout/baseline-placeholder";

export default function ReviewPage() {
  return (
    <BaselinePlaceholder
      title="Review"
      subtitle="Delayed Learning Validation"
      concept="Validates whether information studied days or weeks ago has transferred to durable memory, prompting targeted recall prompts at optimal spaced intervals."
      metricsNeeded="Active learning cards"
      previewItems={[
        { label: "Due Today", value: "2 prompts" },
        { label: "Optimal Interval", value: "3 days" },
        { label: "Confidence Rating", value: "High (4.2/5)" },
      ]}
    />
  );
}
