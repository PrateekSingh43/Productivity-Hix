import type { CheckIn, NormalizedActivityEvent } from "@repo/types";
import { summarizeActivity } from "../activity/aggregate";

export type SelfReportDiscrepancy = {
  checkInId: string;
  reportedProductive: boolean | null;
  observedActiveSeconds: number;
  note: "reported-progress-without-observed-time" | "observed-time-without-progress" | "aligned";
};

export function findDiscrepancies(checkIns: CheckIn[], events: NormalizedActivityEvent[]) {
  const observed = summarizeActivity(events).activeTime;
  return checkIns.map((checkIn): SelfReportDiscrepancy => ({
    checkInId: checkIn.id,
    reportedProductive: checkIn.productive,
    observedActiveSeconds: observed,
    note:
      checkIn.progress && observed < 60
        ? "reported-progress-without-observed-time"
        : !checkIn.progress && observed >= 30 * 60
          ? "observed-time-without-progress"
          : "aligned",
  }));
}
