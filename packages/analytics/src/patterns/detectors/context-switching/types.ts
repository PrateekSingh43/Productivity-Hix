export interface ContextSwitchingConfig {
  minimumEpisodeActiveDurationSeconds: number; // e.g. 1800 (30m)
  minimumUsableCoverageRatio: number; // e.g. 0.85
  shortContextThresholdSeconds: number; // e.g. 30
  minimumQualifyingSessions: number; // e.g. 5
  minimumQualifyingCalendarDays: number; // e.g. 3
  minimumBaselineDays: number; // e.g. 14
  minimumBaselineSessions: number; // e.g. 5
  switchContrastThreshold: number; // e.g. +0.50
  absoluteElevatedSwitchThreshold: number; // e.g. 6.0
  switchRecurrenceThreshold: number; // e.g. 0.60
  minimumPatternCoverageRatio: number; // e.g. 0.85
}

export interface ContextSwitchingMetrics {
  switchesPerHour: number | null;
  medianDwellSeconds: number | null;
  interquartileDwellSeconds: number | null;
  shortContextFraction: number | null;
}
