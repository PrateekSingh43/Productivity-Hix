"use client";

import { useState, useRef, useEffect } from "react";
import { Clock, ChevronDown, Check } from "lucide-react";

export interface PlannedFocusPickerProps {
  value: number; // in minutes
  onChange: (minutes: number) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export const DURATION_PRESETS: Array<{ label: string; value: number }> = [
  { label: "15m", value: 15 },
  { label: "30m", value: 30 },
  { label: "45m", value: 45 },
  { label: "1h", value: 60 },
  { label: "1h 30m", value: 90 },
  { label: "2h", value: 120 },
  { label: "3h", value: 180 },
  { label: "4h", value: 240 },
];

export function formatPlannedDuration(mins: number): string {
  if (!mins || mins <= 0) return "30m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function PlannedFocusPicker({
  value,
  onChange,
  disabled = false,
  id,
  className = "",
}: PlannedFocusPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customInput, setCustomInput] = useState<string>(String(value || 30));
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep custom input string synchronized when value prop changes from outside
  useEffect(() => {
    setCustomInput(String(value || 30));
  }, [value]);

  // Click-outside and Escape key dismissal
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        commitCustomInput();
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, customInput]);

  const commitCustomInput = () => {
    const parsed = parseInt(customInput, 10);
    if (!isNaN(parsed) && parsed > 0) {
      onChange(parsed);
    } else {
      setCustomInput(String(value || 30));
    }
  };

  const handleSelectPreset = (presetValue: number) => {
    onChange(presetValue);
    setCustomInput(String(presetValue));
    setIsOpen(false);
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    commitCustomInput();
    setIsOpen(false);
  };

  const isPresetSelected = DURATION_PRESETS.some((p) => p.value === value);

  return (
    <div ref={containerRef} className={`relative inline-block text-left ${className}`}>
      {/* Closed Control Trigger Button */}
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md bg-bg-card border border-border-subtle hover:border-border-hover text-xs font-mono font-medium text-text-primary transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs"
        title="Select planned focus duration"
      >
        <div className="flex items-center gap-1.5 truncate">
          <Clock size={12} className="text-text-muted shrink-0" />
          <span>{formatPlannedDuration(value)}</span>
        </div>
        <ChevronDown
          size={12}
          className={`text-text-muted shrink-0 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div
          role="dialog"
          aria-label="Planned focus options"
          className="absolute left-0 mt-1.5 z-50 w-56 rounded-xl border border-border-hover bg-bg-card p-2.5 shadow-xl animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted px-1.5 pb-2 font-mono border-b border-border-subtle/50 mb-2 flex items-center justify-between">
            <span>Planned focus</span>
            <span className="text-[10px] lowercase font-normal text-text-muted">presets</span>
          </div>

          {/* Preset Buttons Grid */}
          <div className="grid grid-cols-2 gap-1 mb-2.5">
            {DURATION_PRESETS.map((preset) => {
              const isSelected = value === preset.value;
              return (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSelectPreset(preset.value)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-mono transition-colors cursor-pointer text-left ${
                    isSelected
                      ? "bg-text-primary text-bg-default font-medium shadow-2xs"
                      : "bg-bg-secondary/60 hover:bg-bg-secondary text-text-secondary hover:text-text-primary border border-border-subtle/50"
                  }`}
                >
                  <span>{preset.label}</span>
                  {isSelected && <Check size={11} className="shrink-0 stroke-[2.5]" />}
                </button>
              );
            })}
          </div>

          {/* Custom Minute Input */}
          <form
            onSubmit={handleCustomSubmit}
            className="pt-2 border-t border-border-subtle/60 flex items-center gap-2"
          >
            <span className="text-xs text-text-muted font-medium shrink-0">Custom</span>
            <div className="flex items-center flex-1 bg-bg-secondary border border-border-subtle rounded-md px-2 py-1 focus-within:border-border-hover transition-colors">
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={customInput}
                onChange={(e) => {
                  const cleaned = e.target.value.replace(/[^0-9]/g, "");
                  setCustomInput(cleaned);
                  if (cleaned) {
                    const parsed = parseInt(cleaned, 10);
                    if (parsed > 0) onChange(parsed);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    commitCustomInput();
                    setIsOpen(false);
                  }
                }}
                placeholder="120"
                className="w-full bg-transparent text-xs text-text-primary font-mono outline-none text-right pr-1"
                title="Enter custom duration in minutes"
              />
              <span className="text-[10px] text-text-muted font-mono shrink-0">min</span>
            </div>
            <button
              type="submit"
              className="px-2 py-1 rounded bg-bg-secondary hover:bg-bg-secondary/80 text-text-primary border border-border-subtle text-[11px] font-medium transition-colors cursor-pointer shrink-0"
            >
              Set
            </button>
          </form>

          {!isPresetSelected && value > 0 && (
            <div className="mt-1.5 text-[10px] text-text-muted font-mono text-center">
              Active: {value} min ({formatPlannedDuration(value)})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
