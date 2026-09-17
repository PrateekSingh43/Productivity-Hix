import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyObservation,
  resolveBlockSemantics,
  type ClassificationOverrideRecord as OverrideRecord,
} from "./classify.js";

test("system classifier: VS Code maps to development via CONTEXT_HEURISTIC", () => {
  const r = classifyObservation({ application: "Code.exe", title: "timeline.ts - ProductiveHix" });
  assert.equal(r.modality, "development");
  assert.equal(r.provenance, "CONTEXT_HEURISTIC");
  assert.ok(r.evidence.length > 0);
});

test("system classifier: chess.com domain maps to gaming, never productivity", () => {
  const r = classifyObservation({ application: "Chrome", domain: "chess.com", title: "Chess" });
  assert.equal(r.modality, "gaming");
});

test("system classifier: youtube.com defaults to media_consumption with unknown context", () => {
  const r = classifyObservation({ application: "Chrome", domain: "youtube.com", title: "Some video" });
  assert.equal(r.modality, "media_consumption");
  assert.equal(r.context, null);
});

test("system classifier: unknown app yields unknown", () => {
  const r = classifyObservation({ application: "ObscureTool", title: "" });
  assert.equal(r.modality, "unknown");
});

test("AFK yields idle_away regardless of application", () => {
  const r = classifyObservation({ application: "Code.exe", title: "auth.ts", isAfk: true });
  assert.equal(r.modality, "idle_away");
});

test("user rule overrides system classifier (compositional: context only)", () => {
  const r = classifyObservation({
    application: "Chrome",
    domain: "youtube.com",
    title: "TanStack Query v5 Tutorial",
  }, {
    rules: [
      {
        id: "rule-1",
        name: "YT tutorials",
        priority: 10,
        isEnabled: true,
        applicationPattern: null,
        domainPattern: "youtube\\.com",
        titlePattern: null,
        urlPattern: null,
        assignedModality: null,
        assignedContext: "React Query",
        defaultRelevance: null,
      },
    ],
  });
  assert.equal(r.modality, "media_consumption");
  assert.equal(r.context, "React Query");
  assert.equal(r.contextProvenance, "USER_RULE");
});

test("rule can assign modality when classifier had none", () => {
  const r = classifyObservation({ application: "ObscureTool", title: "" }, {
    rules: [{
      id: "r2", name: "tool", priority: 5, isEnabled: true,
      applicationPattern: "^ObscureTool$", domainPattern: null, titlePattern: null, urlPattern: null,
      assignedModality: "administration", assignedContext: null, defaultRelevance: null,
    }],
  });
  assert.equal(r.modality, "administration");
  assert.equal(r.provenance, "USER_RULE");
});

test("lower priority number wins on conflicting rules", () => {
  const rules = [
    { id: "hi", name: "lo", priority: 50, isEnabled: true, applicationPattern: "Chrome", domainPattern: null, titlePattern: null, urlPattern: null, assignedModality: "communication" as const, assignedContext: null, defaultRelevance: null },
    { id: "lo", name: "hi", priority: 10, isEnabled: true, applicationPattern: "Chrome", domainPattern: null, titlePattern: null, urlPattern: null, assignedModality: "reading_research" as const, assignedContext: null, defaultRelevance: null },
  ];
  const r = classifyObservation({ application: "Chrome", title: "x" }, { rules });
  assert.equal(r.modality, "reading_research");
});

test("disabled rules are ignored", () => {
  const r = classifyObservation({ application: "ObscureTool", title: "" }, {
    rules: [{ id: "d", name: "off", priority: 1, isEnabled: false, applicationPattern: "ObscureTool", domainPattern: null, titlePattern: null, urlPattern: null, assignedModality: "gaming" as const, assignedContext: null, defaultRelevance: null }],
  });
  assert.equal(r.modality, "unknown");
});

test("override beats rule and classifier for the same window", () => {
  const override: OverrideRecord = {
    id: "ov1",
    targetTimeWindowStart: 0,
    targetTimeWindowEnd: 60 * 60_000,
    targetApplication: "Chrome",
    targetClaimFamily: "CLASSIFICATION",
    targetClaimType: "MODALITY_PRIMARY",
    overriddenValue: "gaming",
  };
  const r = resolveBlockSemantics({
    start: 10 * 60_000,
    end: 20 * 60_000,
    application: "Chrome",
    domain: "youtube.com",
    title: "TanStack tutorial",
    isAfk: false,
    source: "browser",
  }, { rules: [], overrides: [override] });
  assert.equal(r.primaryModality, "gaming");
  assert.equal(r.primaryProvenance, "USER_OVERRIDE");
});

test("override outside window does not apply", () => {
  const override: OverrideRecord = {
    id: "ov2",
    targetTimeWindowStart: 5 * 60 * 60_000,
    targetTimeWindowEnd: 6 * 60 * 60_000,
    targetApplication: "Chrome",
    targetClaimFamily: "CLASSIFICATION",
    targetClaimType: "MODALITY_PRIMARY",
    overriddenValue: "gaming",
  };
  const r = resolveBlockSemantics({
    start: 10 * 60_000,
    end: 20 * 60_000,
    application: "Chrome",
    domain: "youtube.com",
    title: "TanStack tutorial",
    isAfk: false,
    source: "browser",
  }, { rules: [], overrides: [override] });
  assert.notEqual(r.primaryProvenance, "USER_OVERRIDE");
});
