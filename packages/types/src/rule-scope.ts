import { resolveLocalDayInterval, getDatesIntersectingInterval, type LocalDayInterval } from "./productive-day";

export type RuleEffectivePolicyType =
  | "future_only"
  | "explicit_range"
  | "bounded_retention";

export interface RuleEffectiveScopeConfig {
  policy: RuleEffectivePolicyType;
  /**
   * Used when policy === 'bounded_retention'.
   * Default in ProductiveHix is 14 days of active retention window.
   */
  boundedDays?: number;
  /**
   * Used when policy === 'explicit_range'.
   */
  rangeStart?: string; // "YYYY-MM-DD"
  rangeEnd?: string;   // "YYYY-MM-DD"
}

export const DEFAULT_BOUNDED_RULE_RETENTION_DAYS = 14;

export const DEFAULT_RULE_EFFECTIVE_SCOPE: RuleEffectiveScopeConfig = {
  policy: "bounded_retention",
  boundedDays: DEFAULT_BOUNDED_RULE_RETENTION_DAYS,
};

/**
 * Resolves the deterministic list of local calendar dates affected by a rule change
 * according to the explicit Rule Effective Scope policy.
 */
export function resolveAffectedDatesForRuleChange(params: {
  policyConfig?: RuleEffectiveScopeConfig;
  referenceDate?: Date | string;
  timezone: string;
}): string[] {
  const config = params.policyConfig ?? DEFAULT_RULE_EFFECTIVE_SCOPE;
  const timezone = params.timezone;
  const refDate = params.referenceDate instanceof Date
    ? params.referenceDate
    : params.referenceDate
    ? new Date(params.referenceDate)
    : new Date();

  const currentLocalInterval = resolveLocalDayInterval(refDate, { timezone });
  const currentLocalDate = currentLocalInterval.localDate;

  if (config.policy === "future_only") {
    return [currentLocalDate];
  }

  if (config.policy === "explicit_range" && config.rangeStart && config.rangeEnd) {
    const dates: string[] = [];
    let cur = config.rangeStart;
    while (cur <= config.rangeEnd) {
      dates.push(cur);
      const [y, m, d] = cur.split("-").map(Number);
      const next = new Date(Date.UTC(y, m - 1, d + 1));
      const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
      const dd = String(next.getUTCDate()).padStart(2, "0");
      cur = `${next.getUTCFullYear()}-${mm}-${dd}`;
    }
    return dates;
  }

  // bounded_retention (default)
  const windowDays = Math.max(1, config.boundedDays ?? DEFAULT_BOUNDED_RULE_RETENTION_DAYS);
  const dates: string[] = [];
  const [y, m, d] = currentLocalDate.split("-").map(Number);

  for (let i = windowDays - 1; i >= 0; i--) {
    const cal = new Date(Date.UTC(y, m - 1, d - i));
    const mm = String(cal.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(cal.getUTCDate()).padStart(2, "0");
    dates.push(`${cal.getUTCFullYear()}-${mm}-${dd}`);
  }

  return dates;
}

/**
 * Resolves affected dates for a targeted override [targetTimeWindowStart, targetTimeWindowEnd)
 * strictly using half-open interval semantics in the user's timezone.
 */
export function resolveAffectedDatesForOverride(params: {
  start: Date;
  end: Date;
  timezone: string;
}): Array<{ localDate: string; scope: { start: string; end: string } }> {
  const touched = getDatesIntersectingInterval(params.start, params.end, params.timezone);
  return touched.map(({ localDate, interval }) => {
    const scopeStart = new Date(Math.max(params.start.getTime(), interval.start.getTime()));
    const scopeEnd = new Date(Math.min(params.end.getTime(), interval.end.getTime()));
    return {
      localDate,
      scope: {
        start: scopeStart.toISOString(),
        end: scopeEnd.toISOString(),
      },
    };
  });
}
