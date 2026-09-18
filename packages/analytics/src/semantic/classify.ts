import type { ActivityModality, ClaimProvenance, ContextRelevance } from "@repo/types";

export interface ClassificationRuleRow {
  id: string;
  name: string;
  priority: number;
  isEnabled: boolean;
  applicationPattern: string | null;
  domainPattern: string | null;
  titlePattern: string | null;
  urlPattern: string | null;
  assignedModality: ActivityModality | null;
  assignedContext: string | null;
  defaultRelevance: ContextRelevance | null;
}

export interface ClassificationOverrideRecord {
  id: string;
  targetTimeWindowStart: number;
  targetTimeWindowEnd: number;
  targetApplication: string;
  targetClaimFamily: string;
  targetClaimType: string;
  overriddenValue: string;
}

export interface ObservationFeatures {
  application: string;
  title: string;
  domain?: string | null;
  url?: string | null;
  isAfk?: boolean;
  source?: string;
}

export interface ClassificationEvidence {
  kind: string;
  reference: string;
}

export interface ClassificationResult {
  modality: ActivityModality;
  confidence: number | null;
  provenance: ClaimProvenance;
  evidence: ClassificationEvidence[];
  context: string | null;
  contextProvenance: ClaimProvenance | null;
  relevance: ContextRelevance | null;
}

export interface ClassificationContext {
  rules?: ClassificationRuleRow[];
  overrides?: ClassificationOverrideRecord[];
}

interface RuleMatch {
  rule: ClassificationRuleRow;
  specificity: number;
}

function safeRegex(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, "i");
  } catch {
    return null;
  }
}

function matchRule(rule: ClassificationRuleRow, obs: ObservationFeatures): number | null {
  if (!rule.isEnabled) return null;
  let specificity = 0;
  let matched = false;
  if (rule.applicationPattern) {
    const re = safeRegex(rule.applicationPattern);
    if (!re || !re.test(obs.application)) return null;
    specificity += 4;
    matched = true;
  }
  if (rule.domainPattern) {
    const re = safeRegex(rule.domainPattern);
    if (!re || !re.test(obs.domain ?? "")) return null;
    specificity += 8;
    matched = true;
  }
  if (rule.titlePattern) {
    const re = safeRegex(rule.titlePattern);
    if (!re || !re.test(obs.title)) return null;
    specificity += 2;
    matched = true;
  }
  if (rule.urlPattern) {
    const re = safeRegex(rule.urlPattern);
    if (!re || !re.test(obs.url ?? "")) return null;
    specificity += 6;
    matched = true;
  }
  return matched ? specificity : null;
}

const APP_MODALITY_PATTERNS: Array<[RegExp, ActivityModality, number]> = [
  [/\b(code|vscode|visual studio code|cursor|antigravity|jetbrains|idea|pycharm|webstorm|rider)\b/i, "development", 0.8],
  [/\b(terminal|powershell|pwsh|cmd|warp|alacritty|iterm)\b/i, "development", 0.7],
  [/\b(postman|insomnia|docker|dbeaver|pgadmin)\b/i, "development", 0.6],
  [/\b(slack|teams|discord|whatsapp|telegram|signal|outlook|mail|gmail)\b/i, "communication", 0.7],
  [/\b(zoom|meet\.google|webex|skype)\b/i, "communication", 0.7],
  [/\b(word|excel|powerpoint|notion|obsidian|onenote)\b/i, "writing_documentation", 0.5],
  [/\b(spotify|music\.youtube|wynk|gaana)\b/i, "media_consumption", 0.8],
  [/\b(settings|control panel|task manager|regedit)\b/i, "system_maintenance", 0.5],
  [/\b(chess\.com|lichess|steam|epic games|riot client)\b/i, "gaming", 0.8],
  [/\b(explorer|finder)\b/i, "administration", 0.3],
];

const DOMAIN_MODALITY_PATTERNS: Array<[RegExp, ActivityModality, number]> = [
  [/chess\.com|lichess\.org/i, "gaming", 0.9],
  [/youtube\.com|youtu\.be|netflix|twitch|primevideo|hotstar/i, "media_consumption", 0.8],
  [/music\.youtube\.com|spotify\.com/i, "media_consumption", 0.9],
  [/docs\.google\.com|notion\.so|confluence/i, "writing_documentation", 0.5],
  [/mail\.google\.com|outlook\./i, "communication", 0.7],
  [/stackoverflow|developer\.mozilla|github\.com|gitlab/i, "reading_research", 0.6],
  [/tanstack|react\.dev|nextjs\.org|python\.org|docs\./i, "reading_research", 0.6],
  [/chatgpt\.com|claude\.ai|gemini\.google\.com/i, "reading_research", 0.5],
];

const TITLE_DEV_PATTERNS: RegExp[] = [
  /\.(ts|tsx|js|jsx|py|rs|go|java|kt|c|cpp|h|cs)\b/i,
  /\b(visual studio code|vscode)\b/i,
];

const TITLE_MEDIA_PATTERNS: RegExp[] = [
  /\b(watch\?v=|official video|trailer|highlights|match|episode)\b/i,
];

function systemClassify(obs: ObservationFeatures): { modality: ActivityModality; confidence: number | null; evidence: ClassificationEvidence[] } {
  const evidence: ClassificationEvidence[] = [];
  if (obs.isAfk) {
    return { modality: "idle_away", confidence: 0.9, evidence: [{ kind: "SENSOR_AFK", reference: "afk_state" }] };
  }
  const domain = obs.domain ?? null;
  if (domain) {
    for (const [re, modality, conf] of DOMAIN_MODALITY_PATTERNS) {
      if (re.test(domain)) {
        return { modality, confidence: conf, evidence: [{ kind: "DOMAIN", reference: domain }] };
      }
    }
  }
  const app = obs.application ?? "";
  for (const [re, modality, conf] of APP_MODALITY_PATTERNS) {
    if (re.test(app)) {
      return { modality, confidence: conf, evidence: [{ kind: "APPLICATION", reference: app }] };
    }
  }
  if (obs.source === "browser") {
    return { modality: "reading_research", confidence: 0.3, evidence: [{ kind: "BROWSER_FALLBACK", reference: domain ?? "browser" }] };
  }
  const title = obs.title ?? "";
  for (const re of TITLE_DEV_PATTERNS) {
    if (re.test(title)) {
      return { modality: "development", confidence: 0.5, evidence: [{ kind: "WINDOW_TITLE", reference: title.slice(0, 120) }] };
    }
  }
  for (const re of TITLE_MEDIA_PATTERNS) {
    if (re.test(title)) {
      return { modality: "media_consumption", confidence: 0.4, evidence: [{ kind: "WINDOW_TITLE", reference: title.slice(0, 120) }] };
    }
  }
  return { modality: "unknown", confidence: null, evidence: [] };
}

function applyRules(
  obs: ObservationFeatures,
  rules: ClassificationRuleRow[]
): { modality: { value: ActivityModality; rule: ClassificationRuleRow } | null; context: { value: string; rule: ClassificationRuleRow } | null; relevance: { value: ContextRelevance; rule: ClassificationRuleRow } | null; matched: RuleMatch[] } {
  const matches: RuleMatch[] = [];
  for (const rule of rules) {
    const specificity = matchRule(rule, obs);
    if (specificity !== null) matches.push({ rule, specificity });
  }
  matches.sort((a, b) => a.rule.priority - b.rule.priority || b.specificity - a.specificity || a.rule.id.localeCompare(b.rule.id));

  let modality: { value: ActivityModality; rule: ClassificationRuleRow } | null = null;
  let context: { value: string; rule: ClassificationRuleRow } | null = null;
  let relevance: { value: ContextRelevance; rule: ClassificationRuleRow } | null = null;
  for (const m of matches) {
    if (!modality && m.rule.assignedModality) {
      modality = { value: m.rule.assignedModality, rule: m.rule };
    }
    if (!context && m.rule.assignedContext) {
      context = { value: m.rule.assignedContext, rule: m.rule };
    }
    if (!relevance && m.rule.defaultRelevance) {
      relevance = { value: m.rule.defaultRelevance, rule: m.rule };
    }
  }
  return { modality, context, relevance, matched: matches };
}

export function classifyObservation(obs: ObservationFeatures, ctx: ClassificationContext = {}): ClassificationResult {
  const system = systemClassify(obs);
  const { modality, context, relevance, matched } = applyRules(obs, ctx.rules ?? []);

  const evidence: ClassificationEvidence[] = [...system.evidence];
  let modalityValue = system.modality;
  let provenance: ClaimProvenance = "CONTEXT_HEURISTIC";
  let confidence = system.confidence;
  if (modality) {
    modalityValue = modality.value;
    provenance = "USER_RULE";
    confidence = null;
    evidence.push({ kind: "USER_RULE", reference: `rule:${modality.rule.id}` });
  }

  let contextValue: string | null = null;
  let contextProvenance: ClaimProvenance | null = null;
  if (context) {
    contextValue = context.value;
    contextProvenance = "USER_RULE";
  }

  return {
    modality: modalityValue,
    confidence,
    provenance,
    evidence,
    context: contextValue,
    contextProvenance,
    relevance: relevance ? relevance.value : null,
  };
}

function overrideApplies(ov: ClassificationOverrideRecord, block: { start: number; end: number; application: string }): boolean {
  const windowOverlap = ov.targetTimeWindowStart < block.end && ov.targetTimeWindowEnd > block.start;
  if (!windowOverlap) return false;
  if (!ov.targetApplication) return true;
  return new RegExp(escapeRegex(ov.targetApplication), "i").test(block.application);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type SemanticActivityType =
  | "coding"
  | "debugging"
  | "code_review"
  | "documentation"
  | "research"
  | "tutorial"
  | "writing"
  | "planning"
  | "communication"
  | "meeting"
  | "administration"
  | "media"
  | "gaming"
  | "idle_away"
  | "unknown";

export function extractProjectContext(title: string, app: string): string | null {
  if (!title) return null;
  const bracketMatch = title.match(/\[([a-zA-Z0-9_\-.]+)\]/);
  if (bracketMatch && bracketMatch[1]) return bracketMatch[1];

  const parts = title.split(/\s+[-—–·|]\s+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const last = parts[parts.length - 1]!;
    if (/\b(visual studio code|vscode|cursor|pycharm|webstorm|sublime)\b/i.test(last) && parts.length >= 3) {
      return parts[parts.length - 2] ?? null;
    }
    if (!/\b(visual studio code|vscode|cursor)\b/i.test(parts[1]!)) {
      return parts[1] ?? null;
    }
  }
  return null;
}

export function extractDocContext(domain: string | null, title: string): string | null {
  const dom = (domain ?? "").toLowerCase();
  if (dom.includes("tanstack")) return "React Query";
  if (dom.includes("react.dev")) return "React";
  if (dom.includes("nextjs.org")) return "Next.js";
  if (dom.includes("python.org")) return "Python";
  if (dom.includes("developer.mozilla.org")) return "MDN Web Docs";
  if (dom.includes("rust-lang.org") || dom.includes("docs.rs")) return "Rust Docs";
  if (dom.includes("github.com")) {
    const parts = title.split(/[-—–|]/).map((p) => p.trim());
    return parts[0] || "GitHub";
  }
  if (title) {
    const docMatch = title.match(/([a-zA-Z0-9_.-]+)\s+(?:docs|documentation|guide|api)/i);
    if (docMatch && docMatch[1]) return docMatch[1];
  }
  return domain || null;
}

export function extractMediaContext(title: string, domain: string | null): string | null {
  const dom = (domain ?? "").toLowerCase();
  if (dom.includes("spotify") || dom.includes("music.youtube")) return "Music";
  if (/\b(music|lofi|ost|song|playlist|synthwave|ambient)\b/i.test(title)) return "Music";
  if (/\b(chess\.com|lichess)\b/i.test(dom) || /\bchess\b/i.test(title)) return "Chess";
  const cleaned = title.replace(/\s*[-—–|]\s*(?:YouTube|Netflix|Twitch).*$/i, "").trim();
  return cleaned.slice(0, 60) || null;
}

export function inferActivityType(
  modality: ActivityModality,
  obs: ObservationFeatures
): { activityType: SemanticActivityType; context: string | null } {
  if (obs.isAfk || modality === "idle_away") {
    return { activityType: "idle_away", context: null };
  }

  const title = obs.title ?? "";
  const domain = obs.domain ?? null;
  const app = obs.application ?? "";

  // 1. Gaming / Chess
  if (modality === "gaming" || /chess\.com|lichess/i.test(domain ?? "") || /chess/i.test(app)) {
    return { activityType: "gaming", context: "Chess" };
  }

  // 2. Development
  if (modality === "development") {
    if (/\b(debug|debugger|test|vitest|jest|pytest|cargo test|pwsh|powershell|terminal|cmd)\b/i.test(title)) {
      return { activityType: "debugging", context: extractProjectContext(title, app) };
    }
    if (/\b(git diff|pull request|pr #|review|commit)\b/i.test(title)) {
      return { activityType: "code_review", context: extractProjectContext(title, app) };
    }
    return { activityType: "coding", context: extractProjectContext(title, app) };
  }

  // 3. Media consumption / YouTube
  if (modality === "media_consumption" || /youtube\.com|youtu\.be/i.test(domain ?? "")) {
    if (/\b(tutorial|course|learn|guide|how to|lecture|workshop)\b/i.test(title)) {
      return { activityType: "tutorial", context: extractMediaContext(title, domain) };
    }
    if (/\b(music|lofi|ost|song|soundtrack|playlist|spotify)\b/i.test(title) || /music\.youtube|spotify/i.test(domain ?? "")) {
      return { activityType: "media", context: "Music" };
    }
    return { activityType: "media", context: extractMediaContext(title, domain) };
  }

  // 4. Reading & Research
  if (modality === "reading_research") {
    if (/\b(tutorial|course|learn|guide)\b/i.test(title)) {
      return { activityType: "tutorial", context: extractDocContext(domain, title) };
    }
    if (/\b(docs|documentation|reference|api|manual)\b/i.test(title) || /tanstack|react\.dev|nextjs\.org|python\.org|docs\./i.test(domain ?? "")) {
      return { activityType: "documentation", context: extractDocContext(domain, title) };
    }
    return { activityType: "research", context: extractDocContext(domain, title) };
  }

  // 5. Writing & Docs
  if (modality === "writing_documentation") {
    if (/\b(plan|roadmap|spec|blueprint|rfc|todo|jira|linear)\b/i.test(title)) {
      return { activityType: "planning", context: extractProjectContext(title, app) };
    }
    return { activityType: "writing", context: extractDocContext(domain, title) };
  }

  // 6. Communication
  if (modality === "communication") {
    if (/\b(meet|zoom|call|huddle|sync|standup)\b/i.test(title) || /zoom|meet\.google/i.test(app) || /meet\.google/i.test(domain ?? "")) {
      return { activityType: "meeting", context: "Meeting" };
    }
    return { activityType: "communication", context: null };
  }

  // 7. Administration
  if (modality === "administration" || modality === "system_maintenance") {
    return { activityType: "administration", context: null };
  }

  return { activityType: "unknown", context: null };
}

export interface BlockSemanticsRequest {
  start: number;
  end: number;
  application: string;
  domain?: string | null;
  title: string;
  url?: string | null;
  isAfk?: boolean;
  source?: string;
}

export interface BlockSemantics {
  primaryModality: ActivityModality;
  primaryConfidence: number | null;
  primaryProvenance: ClaimProvenance;
  activityType: SemanticActivityType;
  evidence: ClassificationEvidence[];
  context: string | null;
  contextProvenance: ClaimProvenance | null;
  relevance: ContextRelevance | null;
}

export function resolveBlockSemantics(block: BlockSemanticsRequest, ctx: ClassificationContext = {}): BlockSemantics {
  const obsFeatures: ObservationFeatures = {
    application: block.application,
    title: block.title,
    domain: block.domain,
    url: block.url,
    isAfk: block.isAfk,
    source: block.source,
  };

  const base = classifyObservation(obsFeatures, ctx);

  let primaryModality = base.modality;
  let primaryConfidence = base.confidence;
  let primaryProvenance = base.provenance;
  let evidence = base.evidence;

  for (const ov of ctx.overrides ?? []) {
    if (ov.targetClaimFamily !== "CLASSIFICATION") continue;
    if (ov.targetClaimType !== "MODALITY_PRIMARY") continue;
    if (!overrideApplies(ov, { start: block.start, end: block.end, application: block.application })) continue;
    primaryModality = ov.overriddenValue as ActivityModality;
    primaryProvenance = "USER_OVERRIDE";
    primaryConfidence = null;
    evidence = [{ kind: "USER_OVERRIDE", reference: `override:${ov.id}` }];
    break;
  }

  const inferred = inferActivityType(primaryModality, obsFeatures);

  let activityType = inferred.activityType;
  let contextValue = base.context ?? inferred.context;
  let contextProvenance = base.contextProvenance ?? (inferred.context ? "CONTEXT_HEURISTIC" : null);

  for (const ov of ctx.overrides ?? []) {
    if (overrideApplies(ov, { start: block.start, end: block.end, application: block.application })) {
      if (ov.targetClaimFamily === "CLASSIFICATION" && ov.targetClaimType === "INFERRED_BEHAVIOR") {
        activityType = ov.overriddenValue as SemanticActivityType;
      }
      if (ov.targetClaimFamily === "INTENT_ASSOCIATION" && ov.targetClaimType === "TOPIC_CONTEXT") {
        contextValue = ov.overriddenValue;
        contextProvenance = "USER_OVERRIDE";
      }
    }
  }

  return {
    primaryModality,
    primaryConfidence,
    primaryProvenance,
    activityType,
    evidence,
    context: contextValue,
    contextProvenance,
    relevance: base.relevance,
  };
}

