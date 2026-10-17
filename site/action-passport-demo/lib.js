// Presentation helpers for the SIMULATED Action Passport demo.
//
// This file deliberately contains no reconstruction logic. The browser only runs a plain
// keyword search over the published events; every link, grade and finding shown in the demo
// comes from the engine's precomputed demo-bundle/v1 files, whose hashes the page can verify.

export const LANES = [
  { system: "agent_trace", label: "AI agent traces" },
  { system: "identity_provider", label: "Identity provider" },
  { system: "ticketing", label: "Support & approvals" },
  { system: "payment_provider", label: "Payments" },
  { system: "erp", label: "ERP" },
];

export const GRADES = {
  DIRECT: { label: "Direct", tone: "direct",
    meaning: "Established by a stable shared reference." },
  SUPPORTED: { label: "Supported", tone: "supported",
    meaning: "Compatible evidence agrees, without a shared reference." },
  INFERRED: { label: "Inferred", tone: "inferred",
    meaning: "Plausible, not established. Alternatives remain." },
  CONFLICTING: { label: "Conflicting", tone: "conflicting",
    meaning: "The records disagree. Nothing is chosen silently." },
  MISSING: { label: "Missing", tone: "missing",
    meaning: "Expected evidence is absent from a fully covered source." },
};

export const NOT_ASSESSABLE = { label: "Not assessable", tone: "unknown",
  meaning: "The source coverage does not allow a conclusion." };

const KIND_LABELS = {
  "agent.run": "Agent run",
  "agent.tool_call": "Agent tool call",
  "identity.delegation": "Delegated identity event",
  "ticket.case": "Customer case",
  "ticket.approval": "Approval ticket",
  "payment.refund": "Payment refund",
  "erp.credit_note": "ERP credit note",
};

export function gradeMeta(grade) {
  return GRADES[grade] ?? NOT_ASSESSABLE;
}

export function formatCount(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function money(amountMinor, currency) {
  if (!Number.isInteger(amountMinor) || typeof currency !== "string") return "an unknown amount";
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(amountMinor / 100);
}

export function kindLabel(kind) {
  return KIND_LABELS[kind] ?? "Record";
}

export function eventLabel(event) {
  return `${kindLabel(event.kind)} ${event.ref}`;
}

const IDENTIFIER = /[A-Za-z]{1,8}[-_][A-Za-z0-9]+(?:[-_][A-Za-z0-9]+)*/g;

/** Identifiers in a natural-language question, e.g. "What happened to RFD-042?" -> ["RFD-042"]. */
export function extractIdentifiers(query) {
  const found = String(query ?? "").match(IDENTIFIER) ?? [];
  return [...new Set(found.map((token) => token.toUpperCase()))];
}

/** Plain keyword search: events whose own reference or any attribute value equals a token. */
export function searchEvents(events, query) {
  const tokens = extractIdentifiers(query);
  const wanted = new Set(tokens);
  const matches = (value) => typeof value === "string" && wanted.has(value.toUpperCase());
  const hits = events.filter(
    (event) => matches(event.ref) || Object.values(event.attrs ?? {}).some(matches),
  );
  return { tokens, hits: hits.sort(byTime) };
}

export function byTime(a, b) {
  return a.time < b.time ? -1 : a.time > b.time ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function countBySystem(events) {
  const counts = Object.fromEntries(LANES.map((lane) => [lane.system, 0]));
  for (const event of events) counts[event.system] = (counts[event.system] ?? 0) + 1;
  return LANES.map((lane) => ({ ...lane, count: counts[lane.system] }));
}

/** Position of an ISO-8601 UTC timestamp within its day, from 0 to 1. */
export function dayFraction(iso) {
  const [hours, minutes, seconds] = iso.slice(11, 19).split(":").map(Number);
  return (hours * 3600 + minutes * 60 + seconds) / 86400;
}

/** A stable value in [0, 1) derived from an ID, so dots never move between page loads. */
export function stableJitter(id) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash / 2 ** 32;
}

/**
 * Records the engine linked to the outcome, and how many other candidates it kept open.
 * The public bundle gives only the number of alternatives, never which records they are.
 */
export function engineLinks(reconstruction) {
  const linked = new Set();
  let alternatives = 0;
  for (const claim of reconstruction.claims) {
    for (const id of [claim.subject, claim.object, ...claim.supporting_evidence_ids]) {
      if (id) linked.add(id);
    }
    alternatives += claim.alternatives_count;
  }
  return { linked, alternatives };
}

/** The coverage facts behind an absence finding, read from the source summary. */
export function coverageChecks(source) {
  if (!source) return [];
  const closed = source.last_sync_status === "succeeded" && source.last_sync >= source.window.end;
  return [
    { label: "Expected for this workflow", ok: source.expected === true },
    { label: "Healthy", ok: source.health === "healthy" },
    { label: `Accessible (${source.read_only_scopes.join(", ")})`,
      ok: source.read_only_scopes.length > 0 },
    { label: "Synchronized after the window closed", ok: closed },
    { label: "Complete for the window", ok: source.complete === true },
  ];
}

export function shortTime(iso) {
  return iso.slice(11, 16);
}

export async function sha256(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Recompute each listed file's SHA-256 and size and compare them with the manifest. */
export async function verifyBundleFiles(manifest, raw) {
  const results = [];
  for (const [name, entry] of Object.entries(manifest.files)) {
    const data = raw[name];
    if (!data) {
      results.push({ name, digest: null, ok: false });
      continue;
    }
    const digest = await sha256(data);
    results.push({ name, digest, ok: digest === entry.sha256 && data.length === entry.bytes });
  }
  return results;
}

/** Whether a catalog entry's manifest hash matches the manifest bytes that were loaded. */
export async function verifyCatalogEntry(entry, manifestBytes) {
  return Boolean(manifestBytes) && (await sha256(manifestBytes)) === entry.manifest_sha256;
}
