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

export interface ContextSwitchEvidence {
  key: string;
  fromKey: string;
  timestamp: string;
  dwellSeconds: number;
  blockId: string;
  taskId?: string;
  sessionId?: string;
}

export interface ContextSwitchingMetrics {
  switches?: ContextSwitchEvidence[];
  switchesPerHour: number | null;
  medianDwellSeconds: number | null;
  interquartileDwellSeconds: number | null;
  shortContextFraction: number | null;
}

export interface ContextSwitchingBaselineSession {
  sessionId: string;
  userId: string;
  startedAt: string;
  endedAt: string;
  activeDurationSeconds: number;
  coverageRatio: number;
  switchesPerHour: number | null;
}

export interface ContextSwitchingPatternMetrics extends ContextSwitchingMetrics {
  elevatedSessionFraction: number | null;
}

