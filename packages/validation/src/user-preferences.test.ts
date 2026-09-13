import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  userPreferencesSchema,
  userPreferencesUpdateSchema,
  formatTimeTo12Hour,
  getDayBoundaryOptions,
  getQuietHoursOptions,
} from "./user-preferences";

describe("User Preferences Schema", () => {
  test("accepts valid default preferences", () => {
    const parsed = userPreferencesSchema.parse({});
    assert.equal(parsed.dayBoundary, "00:00");
    assert.equal(parsed.quietHoursEnabled, true);
    assert.equal(parsed.quietHoursStart, "23:58");
    assert.equal(parsed.quietHoursEnd, "08:00");
  });

  test("accepts custom 24-hour HH:MM values", () => {
    const parsed = userPreferencesSchema.parse({
      dayBoundary: "04:00",
      quietHoursStart: "22:30",
      quietHoursEnd: "07:15",
      timezone: "Asia/Kolkata",
    });
    assert.equal(parsed.dayBoundary, "04:00");
    assert.equal(parsed.quietHoursStart, "22:30");
    assert.equal(parsed.quietHoursEnd, "07:15");
    assert.equal(parsed.timezone, "Asia/Kolkata");
  });

  test("rejects invalid time formats", () => {
    assert.throws(() => {
      userPreferencesSchema.parse({ dayBoundary: "25:00" });
    });
    assert.throws(() => {
      userPreferencesSchema.parse({ quietHoursStart: "12:60" });
    });
  });

  test("partial update schema allows partial updates", () => {
    const update = userPreferencesUpdateSchema.parse({
      dayBoundary: "02:00",
    });
    assert.equal(update.dayBoundary, "02:00");
    assert.equal(update.quietHoursStart, undefined);
  });

  test("formatTimeTo12Hour formats correctly without 24h military time", () => {
    assert.equal(formatTimeTo12Hour("00:00", { showAnnotations: true }), "12:00 AM (Midnight)");
    assert.equal(formatTimeTo12Hour("00:00"), "12:00 AM");
    assert.equal(formatTimeTo12Hour("12:00", { showAnnotations: true }), "12:00 PM (Noon)");
    assert.equal(formatTimeTo12Hour("23:58"), "11:58 PM");
    assert.equal(formatTimeTo12Hour("08:00"), "08:00 AM");
    assert.equal(formatTimeTo12Hour("13:15"), "01:15 PM");
  });

  test("getDayBoundaryOptions provides all 24 hours in 12-hour format", () => {
    const options = getDayBoundaryOptions();
    assert.equal(options.length, 24);
    assert.equal(options[0]?.value, "00:00");
    assert.equal(options[0]?.label, "12:00 AM (Midnight)");
    assert.equal(options[1]?.value, "01:00");
    assert.equal(options[1]?.label, "01:00 AM");
    assert.equal(options[12]?.value, "12:00");
    assert.equal(options[12]?.label, "12:00 PM (Noon)");
    assert.equal(options[23]?.value, "23:00");
    assert.equal(options[23]?.label, "11:00 PM");
  });

  test("getQuietHoursOptions includes custom values like 23:58 sorted properly", () => {
    const options = getQuietHoursOptions(["23:58", "08:00"]);
    assert.ok(options.some((o) => o.value === "23:58" && o.label === "11:58 PM"));
    assert.ok(options.some((o) => o.value === "08:00" && o.label === "08:00 AM"));
    // Ensure 23:58 is after 23:30
    const idx2330 = options.findIndex((o) => o.value === "23:30");
    const idx2358 = options.findIndex((o) => o.value === "23:58");
    assert.ok(idx2358 > idx2330);
  });

  test("normalizeTimezone converts Asia/Calcutta to Asia/Kolkata", () => {
    const parsed = userPreferencesSchema.parse({ timezone: "Asia/Calcutta" });
    assert.equal(parsed.timezone, "Asia/Kolkata");
  });
});


