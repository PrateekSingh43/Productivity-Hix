import type { EvidenceTimeline, PatternSufficiency } from "@repo/types";
import { isValidTemporalWindow } from "../qualification/temporal";

/**
 * Shared Context for Phase 4 Detectors.
 */

export interface DetectorConfiguration {
  detectorIdentity: string;
  detectorVersion: string;
  configurationVersion: string;
  baselineStrategy: string;
  attributionMode: "TASK_LINKED" | "GENERAL";
  sufficiency: PatternSufficiency;
}

export interface PatternExecutionContextOptions {
  timeline: EvidenceTimeline;
  timezone: string;
  userId: string;
  config: DetectorConfiguration;
  level: "EPISODE" | "PATTERN";
}

/**
 * Encapsulates the authoritative evidence and configuration provided to a detector.
 * It validates structural invariants (e.g., valid window shapes, valid timestamps)
 * but does NOT execute PatternSufficiency policy. Policy execution belongs to the
 * guard layer or detector logic.
 */
export class PatternExecutionContext {
  public readonly timeline: EvidenceTimeline;
  public readonly timezone: string;
  public readonly userId: string;
  public readonly config: DetectorConfiguration;
  public readonly level: "EPISODE" | "PATTERN";

  constructor(options: PatternExecutionContextOptions) {
    if (!isValidTemporalWindow(options.timeline.windowStart, options.timeline.windowEnd)) {
      throw new Error(`Invalid timeline temporal window: [${options.timeline.windowStart}, ${options.timeline.windowEnd})`);
    }

    this.timeline = options.timeline;
    this.timezone = options.timezone;
    this.userId = options.userId;
    this.config = options.config;
    this.level = options.level;
  }

  /**
   * Generates operational metadata timestamp.
   * Note: This does NOT generate the deterministic evaluationId. 
   * That requires canonical JSON hashing defined in a later step.
   */
  public generateOperationalMetadata() {
    return {
      detectorVersion: this.config.detectorVersion,
      configurationVersion: this.config.configurationVersion,
      generatedAt: new Date().toISOString(),
    };
  }
}
