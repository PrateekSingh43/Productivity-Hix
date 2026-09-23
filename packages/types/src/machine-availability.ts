/**
 * Canonical Machine Availability domain states.
 *
 * Invariants:
 * - AVAILABLE: Explicit telemetry confirms machine is running and accessible.
 * - UNAVAILABLE: Authoritative telemetry from an OS producer confirms machine entered sleep, hibernation, power-off, lock, etc.
 * - UNKNOWN: No explicit machine-state producer has emitted state.
 *
 * CRITICAL RULE:
 * Silence, absence of heartbeats, AFK, or lack of user input is NEVER converted to SLEEP or POWER_OFF.
 * Without an explicit producer (such as the ProductiveHix Rust agent or OS power event),
 * UNKNOWN is the only epistemically valid state.
 */
export type CanonicalMachineState =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "UNKNOWN";

export type MachineUnavailableReason =
  | "SLEEP"
  | "HIBERNATION"
  | "POWER_OFF"
  | "LOCKED"
  | "OTHER";

export interface MachineAvailabilityEvidence {
  state: CanonicalMachineState;
  reason?: MachineUnavailableReason;
  timestamp: Date | string;
  source: "rust_agent" | "os_event" | "collector_lifecycle" | "unknown";
}

export interface MachineAvailabilityInterval {
  start: Date | string;
  end: Date | string;
  state: CanonicalMachineState;
  reason?: MachineUnavailableReason;
  source: "rust_agent" | "os_event" | "collector_lifecycle" | "unknown";
}

/**
 * ExpectedRestWindow is user-authored routine context.
 * It expresses the user's declared routine schedule (e.g. typically asleep or away from desk).
 *
 * CRITICAL INVARIANTS:
 * - It is NOT machine availability.
 * - It is NOT sleep detection.
 * - It is NOT AFK or silence.
 * - It is NOT a productivity judgment or penalty.
 * - Observed activity occurring during expected rest remains observed activity.
 * - Machine unavailability during expected rest does NOT imply verified sleep.
 */
export interface ExpectedRestWindow {
  startLocalTime: string; // "HH:MM", e.g. "23:00"
  endLocalTime: string;   // "HH:MM", e.g. "07:00"
  isEnabled: boolean;
}
