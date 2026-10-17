// Forkit AI · Action Passport demo (SIMULATED). Displays engine-computed demo-bundle/v1 data.
// The browser runs only a plain keyword search and SHA-256 checks; no reconstruction logic ships here.
import {
  GRADES,
  LANES,
  NOT_ASSESSABLE,
  byTime,
  countBySystem,
  coverageChecks,
  dayFraction,
  engineLinks,
  eventLabel,
  formatCount,
  gradeMeta,
  money,
  searchEvents,
  shortTime,
  stableJitter,
  verifyBundleFiles,
  verifyCatalogEntry,
} from "./lib.js";

const ROOT = "/action-passport-demo/bundle/";
const FILES = ["manifest.json", "events.json", "reconstruction.json", "passport.json", "evidence-package.json"];
const SHOWN_SIZES = [3000, 6000, 9000];
const FALLBACK_SIZE = 5000;
const DAY = 86400;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const SYSTEM_COLORS = {
  agent_trace: "#3fb8c4",
  identity_provider: "#a993f2",
  ticketing: "#e7a6c7",
  payment_provider: "#86cfae",
  erp: "#f2c27e",
};
const GRADE_COLORS = { DIRECT: "#4fd1db", SUPPORTED: "#9fdcd6", INFERRED: "#c9adff", CONFLICTING: "#f49355", MISSING: "#ff8a80" };
const STAMP_INK = { direct: "#007480", supported: "#2f716d", inferred: "#6b48b0", conflicting: "#b45a1c", missing: "#b8443d", outcome: "#2a1f55", context: "#6b5f86" };
const LANE_LABEL = Object.fromEntries(LANES.map((lane) => [lane.system, lane.label]));
const PHRASES = {
  executed_by_agent: {
    DIRECT: "the agent's execution of the refund is established directly",
    SUPPORTED: "the agent's execution is supported",
    INFERRED: "which agent action executed the refund is only inferred",
    CONFLICTING: "the evidence about the execution conflicts",
    MISSING: "no agent action executing the refund was found",
  },
  agent_acted_for: {
    DIRECT: "its delegated identity is established directly",
    SUPPORTED: "its delegated identity is supported by the identity provider",
    INFERRED: "its delegated identity is only inferred",
    CONFLICTING: "the evidence about its delegated identity conflicts",
    MISSING: "no delegated identity was found",
  },
  triggered_by_case: {
    DIRECT: "the triggering customer case is established",
    SUPPORTED: "the triggering customer case is supported",
    INFERRED: "which customer case triggered it remains uncertain",
    CONFLICTING: "the evidence about the trigger conflicts",
    MISSING: "no triggering customer case was found",
  },
  booked_in_erp: {
    DIRECT: "the ERP booking matches",
    SUPPORTED: "the ERP booking is supported",
    INFERRED: "the ERP booking is only inferred",
    CONFLICTING: "the ERP booking conflicts with the payment",
    MISSING: "no ERP booking was found",
  },
  approved_by_human: {
    DIRECT: "a human approval is established",
    SUPPORTED: "a human approval is supported",
    INFERRED: "a human approval is only inferred",
    CONFLICTING: "the approval evidence conflicts",
    MISSING: "no qualifying human approval was found",
  },
};

const $ = (selector) => document.querySelector(selector);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "style") node.style.cssText = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function gradeChip(grade, role) {
  if (role === "outcome") return el("span", { class: "apd-grade outcome", text: "Outcome" });
  if (role === "context") return el("span", { class: "apd-grade context", text: "Context" });
  const meta = gradeMeta(grade);
  return el("span", { class: `apd-grade ${meta.tone}`, title: meta.meaning, text: meta.label });
}

// --- Analytics: consent is enforced in /ga4.js; only categories and dataset sizes are sent --------

const reported = new Set();
function track(name, meta = {}, onceKey = name) {
  if (onceKey && reported.has(onceKey)) return;
  if (onceKey) reported.add(onceKey);
  try {
    window.ForkitAnalytics?.send(name, meta);
  } catch (_) {
    /* Analytics must never break the demo. */
  }
}

// --- State -------------------------------------------------------------------------------------

const state = {
  catalog: null,
  benchmark: null,
  cache: new Map(),
  bundle: null,
  loading: false,
  stage: "ocean",
  query: "",
  hits: new Set(),
  searchMs: null,
  roles: new Map(),
  mode: "ocean",
  points: [],
  styles: [],
  domain: [0, DAY],
  geometry: null,
  pulseUntil: 0,
  frame: 0,
  journey: 0,
};

const entryFor = (events) => state.catalog?.datasets.find((d) => d.events === events);

async function fetchBytes(path) {
  const response = await fetch(ROOT + path, { cache: "no-cache" });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

const decode = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

async function loadBundle(entry) {
  if (!entry) throw new Error("dataset not listed in the catalog");
  if (state.cache.has(entry.events)) return state.cache.get(entry.events);
  const raw = {};
  const parts = await Promise.all(FILES.map((name) => fetchBytes(entry.path + name)));
  FILES.forEach((name, index) => (raw[name] = parts[index]));
  if (!(await verifyCatalogEntry(entry, raw["manifest.json"]))) throw new Error("manifest does not match the catalog");
  const manifest = decode(raw["manifest.json"]);
  const events = decode(raw["events.json"]).events;
  if (manifest.dataset.events !== entry.events || events.length !== entry.events) throw new Error("event count mismatch");
  const reconstruction = decode(raw["reconstruction.json"]);
  const bundle = {
    entry,
    raw,
    manifest,
    events,
    byId: new Map(events.map((event) => [event.id, event])),
    reconstruction,
    passport: decode(raw["passport.json"]),
    claims: Object.fromEntries(reconstruction.claims.map((claim) => [claim.predicate, claim])),
  };
  state.cache.set(entry.events, bundle);
  return bundle;
}

// --- Scene 1: the ocean ---------------------------------------------------------------------------

const canvas = $("#ocean-canvas");
const ctx = canvas.getContext("2d");

function layout() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  const gutter = width < 640 ? 104 : 168;
  const top = 46;
  const bottom = 30;
  const laneHeight = (height - top - bottom) / LANES.length;
  const plotWidth = width - gutter - 18;
  const laneIndex = Object.fromEntries(LANES.map((lane, index) => [lane.system, index]));
  state.geometry = { width, height, gutter, top, bottom, laneHeight, plotWidth, laneIndex };
  state.points = (state.bundle?.events ?? []).map((event) => ({
    event,
    t: dayFraction(event.time) * DAY,
    y: top + (laneIndex[event.system] ?? 0) * laneHeight + 8 + stableJitter(event.id) * (laneHeight - 16),
  }));
}

function slotY(point, role) {
  if (role.count < 2) return point.y;
  const { top, laneHeight, laneIndex } = state.geometry;
  return top + laneIndex[point.event.system] * laneHeight + ((role.slot + 1) / (role.count + 1)) * laneHeight;
}

function targetStyle(point) {
  const { id, system } = point.event;
  const base = SYSTEM_COLORS[system] ?? "#c7c0d6";
  const { y } = point;
  if (state.mode === "ocean") return { color: base, alpha: 0.62, radius: 1.5, y };
  if (state.mode === "search") {
    return state.hits.has(id)
      ? { color: "#ffffff", alpha: 1, radius: 5.5, ring: "#4fd1db", y }
      : { color: base, alpha: 0.1, radius: 1.3, y };
  }
  const role = state.roles.get(id);
  if (role) return { color: role.color, alpha: 1, radius: role.radius, ring: role.ring, y: slotY(point, role) };
  return { color: base, alpha: 0.13, radius: 1.4, y };
}

const mix = (a, b, t) => ({
  color: t < 0.5 ? a.color : b.color,
  alpha: a.alpha + (b.alpha - a.alpha) * t,
  radius: a.radius + (b.radius - a.radius) * t,
  ring: t < 0.5 ? a.ring : b.ring,
  y: a.y + (b.y - a.y) * t,
});
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

function zoomDomain() {
  const times = [...state.roles.keys()].map((id) => dayFraction(state.bundle.byId.get(id).time) * DAY);
  const start = Math.max(0, Math.min(...times) - 18 * 60);
  const end = Math.min(DAY, Math.max(...times) + 12 * 60);
  return [start, end];
}

function xOf(t) {
  const { gutter, plotWidth } = state.geometry;
  const [d0, d1] = state.domain;
  return gutter + ((t - d0) / (d1 - d0)) * plotWidth;
}

function tickStep(span, plotWidth) {
  const maxTicks = Math.max(3, Math.min(9, Math.floor(plotWidth / 64)));
  for (const minutes of [5, 10, 15, 30, 60, 120, 180, 360]) if (span / (minutes * 60) <= maxTicks) return minutes * 60;
  return 6 * 3600;
}

const clock = (t) => {
  const s = Math.round(t);
  return `${String(Math.floor(s / 3600) % 24).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
};

function draw(styles, now = performance.now()) {
  const g = state.geometry;
  if (!g) return;
  const { width, height, gutter, top, bottom, laneHeight, plotWidth } = g;
  ctx.clearRect(0, 0, width, height);
  const counts = Object.fromEntries(countBySystem(state.bundle?.events ?? []).map((lane) => [lane.system, lane.count]));
  ctx.textBaseline = "middle";
  LANES.forEach((lane, index) => {
    const y = top + index * laneHeight;
    ctx.fillStyle = index % 2 ? "rgba(255,255,255,0.018)" : "rgba(255,255,255,0.04)";
    ctx.fillRect(gutter, y, plotWidth, laneHeight);
    ctx.fillStyle = SYSTEM_COLORS[lane.system];
    ctx.fillRect(gutter - 3, y + 6, 2, laneHeight - 12);
    ctx.font = "600 12.5px 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = "#f1ebdf";
    ctx.fillText(lane.label, 14, y + laneHeight / 2 - 8);
    ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.fillStyle = "#9d97b3";
    ctx.fillText(`${formatCount(counts[lane.system] ?? 0)} events`, 14, y + laneHeight / 2 + 9);
  });
  const [d0, d1] = state.domain;
  const step = tickStep(d1 - d0, plotWidth);
  ctx.font = "500 10.5px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.textBaseline = "alphabetic";
  for (let t = Math.ceil(d0 / step) * step; t <= d1 + 1; t += step) {
    const x = xOf(t);
    ctx.fillStyle = "rgba(241,235,223,0.08)";
    ctx.fillRect(x, top, 1, height - top - bottom);
    ctx.fillStyle = "#8f88a8";
    ctx.fillText(clock(t), Math.min(Math.max(x - 16, gutter), width - 40), height - 10);
  }
  ctx.font = "600 10px 'IBM Plex Mono', ui-monospace, monospace";
  ctx.fillStyle = "#bfe6e8";
  ctx.textBaseline = "middle";
  const span = d1 - d0 > 6 * 3600 ? "00:00–24:00 UTC · simulated day" : `${clock(d0)}–${clock(d1)} UTC · zoomed to the reconstructed action`;
  ctx.fillText(span.toUpperCase(), Math.max(gutter, width - ctx.measureText(span.toUpperCase()).width - 18), 22);

  const order = styles.map((_, index) => index).sort((a, b) => styles[a].radius - styles[b].radius);
  const left = gutter - 8;
  const right = gutter + plotWidth + 8;
  for (const index of order) {
    const style = styles[index];
    const x = xOf(state.points[index].t);
    if (x < left || x > right) continue;
    ctx.globalAlpha = style.alpha;
    ctx.fillStyle = style.color;
    if (style.radius < 2.2) {
      ctx.fillRect(x - style.radius, style.y - style.radius, style.radius * 2, style.radius * 2);
      continue;
    }
    ctx.beginPath();
    ctx.arc(x, style.y, style.radius, 0, Math.PI * 2);
    ctx.fill();
    if (style.ring) {
      ctx.globalAlpha = Math.min(1, style.alpha) * 0.6;
      ctx.strokeStyle = style.ring;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, style.y, style.radius + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  if (state.mode === "search" && now < state.pulseUntil) drawPulses(styles, now);
  if (state.mode === "reconstructed" && state.journey > 0) drawJourney(styles, state.journey);
}

function drawPulses(styles, now) {
  const phase = (now % 1200) / 1200;
  ctx.strokeStyle = "#4fd1db";
  ctx.lineWidth = 1.5;
  state.points.forEach((point, index) => {
    if (!state.hits.has(point.event.id)) return;
    ctx.globalAlpha = (1 - phase) * 0.8;
    ctx.beginPath();
    ctx.arc(xOf(point.t), styles[index].y, 8 + phase * 22, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;
}

function drawJourney(styles, progress) {
  const linked = state.points
    .map((point, index) => ({ ...point, y: styles[index].y, x: xOf(point.t) }))
    .filter((point) => state.roles.has(point.event.id))
    .sort((a, b) => byTime(a.event, b.event));
  if (linked.length < 2) return;
  ctx.save();
  ctx.globalAlpha = 0.85 * progress;
  ctx.strokeStyle = "#f1ebdf";
  ctx.lineWidth = 1.6;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  linked.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = progress;
  ctx.font = "600 12px 'IBM Plex Sans', ui-sans-serif, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  const narrow = state.geometry.width < 640;
  for (const point of linked) {
    const role = state.roles.get(point.event.id);
    const text = narrow ? role.short : role.caption;
    const width = ctx.measureText(text).width;
    const placeLeft = role.count > 1 && role.slot % 2 === 0 && point.x - width - 18 > state.geometry.gutter;
    const x = placeLeft
      ? point.x - width - 14
      : Math.max(state.geometry.gutter + 4, Math.min(point.x + 14, state.geometry.width - width - 12));
    ctx.fillStyle = "rgba(18,13,44,0.88)";
    ctx.fillRect(x - 5, point.y - 11, width + 10, 22);
    ctx.fillStyle = role.color;
    ctx.fillText(text, x, point.y);
  }
  ctx.restore();
}

let animation = 0;
function animateTo(mode, domain) {
  if (!state.geometry) return;
  const from = state.styles.length === state.points.length ? state.styles : state.points.map(targetStyle);
  const fromDomain = [...state.domain];
  state.mode = mode;
  const to = state.points.map(targetStyle);
  const toDomain = domain ?? [0, DAY];
  cancelAnimationFrame(animation);
  if (REDUCED) {
    state.styles = to;
    state.domain = toDomain;
    state.journey = mode === "reconstructed" ? 1 : 0;
    draw(to);
    return;
  }
  const started = performance.now();
  const duration = mode === "reconstructed" ? 1500 : 900;
  if (mode === "search") state.pulseUntil = started + duration + 2600;
  const step = (now) => {
    const t = Math.min(1, (now - started) / duration);
    const e = ease(t);
    state.domain = [fromDomain[0] + (toDomain[0] - fromDomain[0]) * e, fromDomain[1] + (toDomain[1] - fromDomain[1]) * e];
    state.journey = mode === "reconstructed" ? Math.max(0, (t - 0.55) / 0.45) : 0;
    const frame = t < 1 ? from.map((style, index) => mix(style, to[index], e)) : to;
    state.styles = frame;
    draw(frame, now);
    if (t < 1 || (mode === "search" && now < state.pulseUntil)) animation = requestAnimationFrame(step);
  };
  animation = requestAnimationFrame(step);
}

function renderOcean() {
  layout();
  state.styles = state.points.map(targetStyle);
  draw(state.styles);
  const { events } = state.bundle;
  const lanes = countBySystem(events);
  $('[data-count="events"]').textContent = formatCount(events.length);
  $('[data-count="systems"]').textContent = String(lanes.filter((lane) => lane.count).length);
  $("#ocean-legend").replaceChildren(
    ...lanes.map((lane) =>
      el("li", {}, el("i", { style: `background:${SYSTEM_COLORS[lane.system]}` }), `${lane.label} `, el("b", { text: formatCount(lane.count) })),
    ),
  );
  canvas.setAttribute(
    "aria-label",
    `${formatCount(events.length)} synthetic log events from ${lanes.length} systems across one simulated day`,
  );
}

function setOceanState(text) {
  $("#ocean-state").textContent = text;
}

function wireTooltip() {
  const tip = $("#ocean-tip");
  canvas.addEventListener("mousemove", (event) => {
    if (!state.geometry) return;
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    let best = null;
    let bestDistance = 100;
    state.points.forEach((point, index) => {
      const style = state.styles[index];
      if (!style || (state.mode !== "ocean" && style.alpha < 0.3)) return;
      const px = xOf(point.t);
      const distance = (px - x) ** 2 + (style.y - y) ** 2;
      if (distance < bestDistance) {
        best = { point, px, py: style.y };
        bestDistance = distance;
      }
    });
    if (!best) {
      tip.hidden = true;
      return;
    }
    const { event: record } = best.point;
    tip.textContent = `${eventLabel(record)} · ${LANE_LABEL[record.system]} · ${shortTime(record.time)} UTC`;
    tip.hidden = false;
    tip.style.left = `${Math.max(8, Math.min(best.px + 14, box.width - tip.offsetWidth - 8))}px`;
    tip.style.top = `${Math.max(8, best.py - 40)}px`;
  });
  canvas.addEventListener("mouseleave", () => (tip.hidden = true));
}

// --- Dataset picker -------------------------------------------------------------------------------

function renderPicker() {
  const current = state.bundle?.entry.events;
  const sizes = SHOWN_SIZES.filter((size) => entryFor(size));
  $("#size-options").replaceChildren(
    ...sizes.map((size) =>
      el("button", {
        type: "button",
        role: "radio",
        "aria-checked": size === current ? "true" : "false",
        "data-size": String(size),
        disabled: state.loading,
        text: `${formatCount(size)} events`,
      }),
    ),
  );
}

async function selectDataset(size, initial = false) {
  if (state.loading) return;
  state.loading = true;
  renderPicker();
  setOceanState(`Loading and verifying ${formatCount(size)} synthetic events…`);
  let bundle = null;
  let notice = "";
  try {
    bundle = await loadBundle(entryFor(size));
  } catch (error) {
    if (size !== FALLBACK_SIZE && entryFor(FALLBACK_SIZE)) {
      try {
        bundle = await loadBundle(entryFor(FALLBACK_SIZE));
        notice = `The ${formatCount(size)}-event dataset could not be verified (${error.message}). Showing the verified 5,000-event M2 reference dataset instead.`;
      } catch (fallbackError) {
        notice = `The demo data could not be loaded (${fallbackError.message}).`;
      }
    } else {
      notice = `The demo data could not be loaded (${error.message}).`;
    }
  }
  state.loading = false;
  if (!bundle) {
    setOceanState("Demo data unavailable");
    $("#size-note").replaceChildren(el("span", { class: "apd-notice", text: notice }));
    renderPicker();
    return;
  }
  state.bundle = bundle;
  state.roles = state.stage === "reconstructed" ? buildRoles() : new Map();
  renderOcean();
  renderPicker();
  renderNumbers();
  renderMeta();
  $("#size-note").replaceChildren(
    notice
      ? el("span", { class: "apd-notice", text: notice })
      : `Each size is a separate engine run on its own generated dataset. Showing ${formatCount(bundle.entry.events)} events.`,
  );
  setOceanState(`${formatCount(bundle.entry.events)} synthetic events · ${bundle.entry.systems} systems`);
  try {
    const url = new URL(location.href);
    url.searchParams.set("events", String(bundle.entry.events));
    history.replaceState(null, "", url);
  } catch (_) {
    /* URL updates are optional. */
  }
  if (state.stage !== "ocean") runSearch(state.query, true);
  if (state.stage === "reconstructed") reveal(true);
  if (!initial) track("apd_dataset_selected", { dataset_events: bundle.entry.events }, null);
}

// --- Scene 2: find the action ---------------------------------------------------------------------

function runSearch(query, silent = false) {
  const { events, reconstruction } = state.bundle;
  const started = performance.now();
  const { tokens, hits } = searchEvents(events, query);
  state.searchMs = performance.now() - started;
  state.query = query;
  state.hits = new Set(hits.map((hit) => hit.id));
  const outcomeId = reconstruction.outcome.outcome_id;
  const isOutcome = tokens.includes(outcomeId.toUpperCase());
  const box = $("#search-result");
  box.replaceChildren();
  $("#engine-step").hidden = true;
  if (!silent || state.stage !== "reconstructed" || !isOutcome) {
    state.stage = "searched";
    $("#reveal-result").replaceChildren();
    hideLaterScenes();
  }
  animateTo("search");
  if (!silent) {
    const outcome = !tokens.length ? "no_identifier" : !hits.length ? "no_match" : isOutcome ? "refund_found" : "other_match";
    track("apd_demo_started", { dataset_events: state.bundle.entry.events });
    track("apd_search", { dataset_events: state.bundle.entry.events, search_outcome: outcome }, null);
  }
  if (!tokens.length) {
    box.append(el("p", { class: "apd-stat", text: "Ask about a specific identifier, for example: What happened to refund RFD-042?" }));
    return;
  }
  box.append(
    el("p", { class: "apd-stat" }, "Keyword search found ", el("strong", { text: formatCount(hits.length) }), " of ",
      el("strong", { text: formatCount(events.length) }), " events that mention ", el("strong", { text: tokens.join(", ") }), "."),
    el("ul", { class: "apd-chips" }, hits.slice(0, 12).map((hit) =>
      el("li", {}, el("i", { style: `background:${SYSTEM_COLORS[hit.system]}` }), `${eventLabel(hit)} · ${LANE_LABEL[hit.system]} · ${shortTime(hit.time)} UTC`))),
    el("p", { class: "apd-fine", text: `Searched ${formatCount(events.length)} events in ${state.searchMs < 1 ? "under 1" : Math.round(state.searchMs)} ms in your browser.` }),
  );
  if (isOutcome) {
    const found = new Set(hits.map((hit) => hit.system));
    const silentSystems = LANES.filter((lane) => !found.has(lane.system)).map((lane) => lane.label);
    $("#engine-gap").textContent = silentSystems.length
      ? `${outcomeId} never appears in ${silentSystems.join(", ")}. Linking those records needs evidence beyond a shared ID.`
      : "Every system mentions this identifier.";
    $("#engine-step").hidden = state.stage === "reconstructed";
  } else {
    box.append(el("p", { class: "apd-fine" }, `In this demo, a full reconstruction is published for ${outcomeId}. `,
      el("button", { type: "button", class: "btn secondary apd-inline", "data-query": "outcome", text: `SEARCH ${outcomeId}` })));
  }
}

function buildRoles() {
  const { reconstruction, byId } = state.bundle;
  const roles = new Map();
  const outcome = byId.get(reconstruction.outcome.record_id);
  roles.set(outcome.id, { color: "#ffffff", radius: 8, ring: "#f49355", caption: `Outcome · ${eventLabel(outcome)}`, short: `Outcome · ${outcome.ref}` });
  for (const claim of reconstruction.claims) {
    const object = claim.object && byId.get(claim.object);
    if (object && !roles.has(object.id)) {
      const label = gradeMeta(claim.grade).label;
      roles.set(object.id, { color: GRADE_COLORS[claim.grade] ?? "#c7c0d6", radius: 6.5, ring: "#f1ebdf", caption: `${label} · ${eventLabel(object)}`, short: `${label} · ${object.ref}` });
    }
    const subject = byId.get(claim.subject);
    if (subject && subject.kind === "agent.run" && !roles.has(subject.id)) {
      roles.set(subject.id, { color: "#c7c0d6", radius: 5.5, ring: "#9d97b3", caption: `Context · ${eventLabel(subject)}`, short: `Context · ${subject.ref}` });
    }
  }
  const lanes = new Map();
  for (const id of roles.keys()) {
    const event = byId.get(id);
    lanes.set(event.system, [...(lanes.get(event.system) ?? []), event]);
  }
  for (const group of lanes.values()) {
    group.sort(byTime).forEach((event, slot) => Object.assign(roles.get(event.id), { slot, count: group.length }));
  }
  return roles;
}

function hideLaterScenes() {
  for (const id of ["passport", "revelation", "evidence"]) {
    $(`#${id}`).hidden = true;
    $(`[data-step="${id}"]`).setAttribute("aria-disabled", "true");
  }
}

function reveal(silent = false) {
  const { reconstruction, byId, entry } = state.bundle;
  state.stage = "reconstructed";
  state.roles = buildRoles();
  const { alternatives } = engineLinks(reconstruction);
  const linked = [...state.roles.keys()].map((id) => byId.get(id));
  const systems = new Set(linked.map((event) => event.system));
  const unseen = linked.filter((event) => !state.hits.has(event.id));
  layout();
  animateTo("reconstructed", zoomDomain());
  $("#engine-step").hidden = true;
  const versions = reconstruction.versions;
  $("#reveal-result").replaceChildren(
    el("span", { class: "apd-mode engine", text: "PRECOMPUTED · PRIVATE FORKIT ENGINE" }),
    el("p", { class: "apd-stat", style: "margin-top:12px" }, "The engine connected ", el("strong", { text: linked.length }), " records across ",
      el("strong", { text: systems.size }), " systems; ", el("strong", { text: unseen.length }),
      ` of them never mention ${reconstruction.outcome.outcome_id}. One link stays open: `, el("strong", { text: formatCount(alternatives) }),
      " other records remain plausible candidates for it."),
    el("div", { class: "apd-provline" },
      el("span", {}, "Evaluation ", el("code", { text: `${reconstruction.evaluation_id.slice(0, 18)}…` })),
      el("span", { text: `${versions.engine} · ${versions.rule_set} · ${versions.grading_policy}` }),
      el("span", { text: `${formatCount(entry.events)}-event dataset` })),
    el("p", {}, el("a", { class: "text-link", href: "#passport", text: "OPEN THE ACTION PASSPORT ↓" })),
  );
  for (const id of ["passport", "revelation", "evidence"]) {
    $(`#${id}`).hidden = false;
    $(`[data-step="${id}"]`).removeAttribute("aria-disabled");
  }
  renderPassport();
  renderRevelation();
  renderEvidence();
  renderNumbers();
  if (!silent) track("apd_reconstruction_viewed", { dataset_events: entry.events });
}

// --- Scene 3: the Action Passport ----------------------------------------------------------------

function renderPassport() {
  const { passport, claims, byId, reconstruction, entry } = state.bundle;
  const outcome = byId.get(reconstruction.outcome.record_id);
  const call = claims.executed_by_agent?.object && byId.get(claims.executed_by_agent.object);
  const delegation = claims.agent_acted_for?.object && byId.get(claims.agent_acted_for.object);
  $("#passport-disclaimer").textContent = passport.disclaimer;
  $("#passport-outcome").replaceChildren(
    `${money(outcome.attrs.amount_minor, outcome.attrs.currency)} refund`,
    el("small", { text: `${passport.outcome.outcome_id} · PAYMENT ${outcome.ref} · ${shortTime(outcome.time)} UTC` }),
  );
  const rows = [
    ["Agent", el("span", {}, el("code", { text: passport.holder.agent }), el("br"), el("small", { text: `Passport reference in the trace: ${passport.holder.agent_passport_reference ?? "not observed"}` }))],
    ["Human principal", el("span", {}, el("code", { text: passport.delegated_authority.on_behalf_of ?? "unknown" }), " (pseudonym)")],
    ["Delegated authority", el("span", {}, `${delegation ? eventLabel(delegation) : "Not observed"} `, gradeChip(passport.delegated_authority.grade))],
    ["Executed", call ? `${shortTime(call.time)} UTC · ${eventLabel(call)}` : "No tool call observed"],
  ];
  $("#passport-fields").replaceChildren(...rows.flatMap(([term, value]) => [el("dt", { text: term }), el("dd", {}, value)]));
  $("#passport-visa").replaceChildren(...passport.visa.map((item) =>
    el("li", {}, el("div", { class: "apd-visa-head" }, item.item,
      item.grade ? gradeChip(item.grade) : el("span", { class: "apd-grade unknown", text: "Not captured" })),
    el("p", { text: item.status }))));
  const ref = passport.outcome.outcome_id.replace(/[^A-Z0-9]/gi, "").toUpperCase();
  const evaluation = reconstruction.evaluation_id.replace(/[^a-z0-9]/gi, "").slice(4, 12).toUpperCase();
  $("#passport-mrz").textContent = `ACTION<<${ref}<<${entry.events}EVT<<EVAL${evaluation}<<SIMULATED<<<<<<<<<<`;
  const stamps = passport.stamps.map((stamp) => {
    const tone = stamp.role === "linked" ? gradeMeta(stamp.grade).tone : stamp.role;
    return el("div", {
      class: `apd-stamp${tone === "inferred" || tone === "context" ? " dashed" : ""}`,
      style: `--c:${STAMP_INK[tone] ?? "#2a1f55"};--r:${((stableJitter(stamp.record_id) - 0.5) * 5).toFixed(2)}deg`,
    },
    el("span", { class: "apd-stamp-system", text: LANE_LABEL[stamp.system] ?? stamp.system }),
    el("span", { class: "apd-stamp-time", text: `${shortTime(stamp.time)} UTC` }),
    el("span", { class: "apd-stamp-label", text: stamp.label }),
    el("span", { class: "apd-stamp-link", text: stamp.link }),
    gradeChip(stamp.grade, stamp.role === "linked" ? undefined : stamp.role));
  });
  if (claims.approved_by_human?.grade === "MISSING") {
    stamps.push(el("div", { class: "apd-stamp dashed", style: `--c:${STAMP_INK.missing};--r:1.2deg` },
      el("span", { class: "apd-stamp-system", text: "Support & approvals" }),
      el("span", { class: "apd-stamp-time", text: "No stamp" }),
      el("span", { class: "apd-stamp-label", text: "Expected: human approval" }),
      el("span", { class: "apd-stamp-link", text: "Absent from a fully covered source" }),
      gradeChip("MISSING")));
  }
  $("#passport-stamps").replaceChildren(...stamps);
  renderTimeline();
  $("#grade-key").replaceChildren(
    ...[...Object.values(GRADES), NOT_ASSESSABLE].map((meta) =>
      el("li", {}, el("span", {}, el("span", { class: `apd-grade ${meta.tone}`, text: meta.label })), meta.meaning)),
  );
}

function renderTimeline() {
  const { passport, claims } = state.bundle;
  const approval = claims.approved_by_human;
  const items = passport.stamps.map((stamp) => ({ time: stamp.time, stamp }));
  if (approval?.grade === "MISSING") items.push({ time: approval.relevant_time, gap: true });
  items.sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.gap ? -1 : 1));
  $("#passport-timeline").replaceChildren(...items.map((item) => {
    if (item.gap) {
      return el("li", { class: "gap" }, el("span", { class: "t", text: shortTime(item.time) }),
        el("span", { class: "dot", style: "background:var(--apd-missing)" }),
        el("div", { class: "body" }, el("strong", {}, "Expected: human approval before execution "), gradeChip("MISSING"),
          el("p", { text: "No qualifying approval exists in the approval source, which was fully covered for the review window." })));
    }
    const { stamp } = item;
    const tone = stamp.role === "linked" ? gradeMeta(stamp.grade).tone : stamp.role;
    const color = tone === "outcome" ? "var(--orange)" : tone === "context" ? "var(--apd-text-3)" : `var(--apd-${tone})`;
    return el("li", {}, el("span", { class: "t", text: shortTime(stamp.time) }),
      el("span", { class: "dot", style: `background:${color}` }),
      el("div", { class: "body" }, el("strong", { text: stamp.label }), " ", gradeChip(stamp.grade, stamp.role === "linked" ? undefined : stamp.role),
        el("p", { text: `${LANE_LABEL[stamp.system] ?? stamp.system} · ${stamp.link}` })));
  }));
}

// --- Scene 4: the revelation ---------------------------------------------------------------------

function renderRevelation() {
  const { claims, passport, byId, reconstruction } = state.bundle;
  const outcome = byId.get(reconstruction.outcome.record_id);
  const call = claims.executed_by_agent?.object && byId.get(claims.executed_by_agent.object);
  const phrases = Object.entries(PHRASES).filter(([p]) => claims[p]?.grade).map(([p, byGrade]) => byGrade[claims[p].grade]);
  const last = phrases.pop();
  $("#what-happened").textContent =
    `At ${shortTime((call ?? outcome).time)} UTC, the AI agent ${passport.holder.agent}, acting for ` +
    `${passport.delegated_authority.on_behalf_of ?? "an unidentified person"}, issued a ` +
    `${money(outcome.attrs.amount_minor, outcome.attrs.currency)} refund (${passport.outcome.outcome_id}). ` +
    `In the evidence, ${phrases.join(", ")}${phrases.length ? ", and " : ""}${last}.`;
  const cards = [];
  const booking = claims.booked_in_erp;
  const amount = booking?.contradictions.find((c) => c.field === "amount_minor");
  if (booking?.grade === "CONFLICTING" && amount) {
    const left = byId.get(amount.left.record_id);
    const right = byId.get(amount.right.record_id);
    const currency = left.attrs.currency;
    const delta = Math.abs(amount.left.value - amount.right.value);
    cards.push(el("article", { class: "apd-finding conflicting" },
      el("p", { class: "kicker", text: "Financial discrepancy · CONFLICTING" }),
      el("h3", { text: "The ERP books less than the payment refunded." }),
      el("div", { class: "apd-amounts" },
        el("div", {}, el("strong", { text: money(amount.left.value, currency) }), el("span", { text: `${eventLabel(left)} · ${LANE_LABEL[left.system]}` })),
        el("div", {}, el("strong", { text: money(amount.right.value, currency) }), el("span", { text: `${eventLabel(right)} · ${LANE_LABEL[right.system]}` }))),
      el("div", { class: "apd-delta" }, el("strong", { text: money(delta, currency) }), el("span", { text: "difference between the two records" })),
      el("p", { text: "Both values are kept as evidence. Neither is chosen silently, and the difference is not explained by the records." })));
  }
  const approval = claims.approved_by_human;
  if (approval?.grade === "MISSING") {
    const source = reconstruction.sources.find((s) => s.system === "ticketing");
    cards.push(el("article", { class: "apd-finding missing" },
      el("p", { class: "kicker", text: "Approval evidence missing · MISSING" }),
      el("h3", { text: "No qualifying human approval was found." }),
      el("p", { text: "MISSING is shown only because the approval source was:" }),
      el("ul", { class: "apd-checks" }, coverageChecks(source).map((check) => el("li", { class: check.ok ? undefined : "no", text: check.label }))),
      el("p", { class: "apd-fine", text: `Coverage window: ${source.window.start} to ${source.window.end}. This states what the evidence shows, not whether a rule was broken.` })));
  }
  const trigger = claims.triggered_by_case;
  if (trigger?.grade === "INFERRED") {
    const object = byId.get(trigger.object);
    cards.push(el("article", { class: "apd-finding inferred" },
      el("p", { class: "kicker", text: "Uncertain link · INFERRED" }),
      el("h3", { text: "Which customer case triggered the run is not established." }),
      el("p", { text: `${eventLabel(object)} is a candidate, but the link is not established: ${formatCount(trigger.alternatives_count)} other customer cases remain plausible.` }),
      el("p", { class: "apd-fine", text: "The public demo gives the number of candidates, not which records they are." })));
  }
  for (const claim of reconstruction.claims) {
    if (claim.grade === null) {
      cards.push(el("article", { class: "apd-finding" }, el("p", { class: "kicker", text: "Cannot be assessed" }),
        el("h3", { text: claim.statement }), el("p", { text: claim.coverage_gap?.reason ?? "" })));
    }
  }
  $("#finding-cards").replaceChildren(...cards);
  $("#next-steps").replaceChildren(...passport.next_steps.map((step) => el("li", { text: step })));
}

// --- Scene 5: evidence package -------------------------------------------------------------------

function techDetails(claim) {
  const { byId } = state.bundle;
  const rows = [
    ["Rule", `${claim.rule_id} ${claim.rule_version}`],
    ["Grading policy", claim.policy_version],
    ["What the grade means", claim.explanation],
    ["Relevant time", claim.relevant_time],
    ["Supporting records", claim.supporting_evidence_ids.map((id) => eventLabel(byId.get(id))).join("; ") || "None"],
    ["Other plausible candidates", claim.alternatives_count ? formatCount(claim.alternatives_count) : "None"],
    ["Contradictions", claim.contradictions.map((c) => c.description).join("; ") || "None"],
    ["Coverage gap", claim.coverage_gap ? claim.coverage_gap.reason : "None"],
    ["Record IDs", [claim.subject, claim.object].filter(Boolean).join(" · ")],
  ];
  return el("details", {}, el("summary", { text: "Technical evidence" }),
    el("div", { class: "apd-tech" }, el("dl", {}, rows.flatMap(([term, value]) =>
      [el("dt", { text: term }), el("dd", { class: term === "Record IDs" ? "apd-mono" : undefined, text: value })]))));
}

function renderEvidence() {
  const { reconstruction, manifest, byId, entry } = state.bundle;
  $("#evidence-table").replaceChildren(...reconstruction.claims.map((claim) => {
    const records = [claim.subject, claim.object].filter(Boolean).map((id) => eventLabel(byId.get(id)));
    const others = claim.alternatives_count ? ` · ${formatCount(claim.alternatives_count)} other plausible candidates` : "";
    return el("article", { class: "apd-claim" },
      el("div", { class: "apd-claim-head" }, el("div", {}, gradeChip(claim.grade)),
        el("div", {}, el("strong", { text: claim.statement }), el("small", { text: `Evidence: ${records.join(" ↔ ")}${others}` }))),
      techDetails(claim));
  }));
  const header = el("tr", {}, ["System", "Expected", "Health", "Complete", "Last sync", "Read-only scopes", "Records"].map((name) => el("th", { text: name })));
  const rows = reconstruction.sources.map((s) => el("tr", {},
    el("td", { text: LANE_LABEL[s.system] ?? s.system }), el("td", { text: s.expected ? "Yes" : "No" }), el("td", { text: s.health }),
    el("td", { text: s.complete ? "Yes" : "No" }), el("td", { class: "nowrap", text: `${s.last_sync_status} · ${s.last_sync.slice(0, 16).replace("T", " ")} UTC` }),
    el("td", { class: "apd-mono", text: s.read_only_scopes.join(", ") }), el("td", { text: formatCount(s.record_count) })));
  $("#coverage-table").replaceChildren(el("table", {}, el("thead", {}, header), el("tbody", {}, rows)));
  const generator = manifest.dataset.generator;
  const versions = reconstruction.versions;
  const provenance = [
    ["Dataset", `${manifest.dataset.dataset_id} · ${formatCount(manifest.dataset.events)} events · ${manifest.dataset.systems} systems`],
    ["Generator", `${generator.generator_version} · seed ${generator.seed} · ${formatCount(generator.core_events)} core + ${formatCount(generator.background_events)} background events`],
    ["Computed by", `${versions.engine} · ${versions.rule_set} · ${versions.grading_policy}`],
    ["Evaluation", reconstruction.evaluation_id],
    ["Canonical JSON", versions.canonicalization],
    ["Manifest SHA-256", entry.manifest_sha256],
    ["Bundle", manifest.bundle_version],
  ];
  $("#provenance").replaceChildren(...provenance.flatMap(([term, value]) =>
    [el("dt", { text: term }), el("dd", { class: term.includes("SHA") || term === "Evaluation" ? "apd-mono" : undefined, text: value })]));
  $("#verify-scope").replaceChildren(
    "Your browser checks that this dataset's manifest matches the published catalog, then recomputes the SHA-256 of every file and compares it with the manifest. A match shows the files were not altered after publication; it does not prove source authenticity.",
  );
  $("#verify-result").replaceChildren();
}

async function onVerify() {
  const bundle = state.bundle;
  const list = $("#verify-result");
  list.replaceChildren(el("li", { text: "Computing SHA-256 in your browser…" }));
  const catalogOk = await verifyCatalogEntry(bundle.entry, bundle.raw["manifest.json"]);
  const results = await verifyBundleFiles(bundle.manifest, bundle.raw);
  const ok = catalogOk && results.every((r) => r.ok);
  if (state.bundle !== bundle) return;
  list.replaceChildren(
    el("li", { class: catalogOk ? "ok" : "bad" }, "manifest.json: ", el("code", { text: `${bundle.entry.manifest_sha256.slice(0, 23)}…` }),
      catalogOk ? " matches the published catalog" : " does NOT match the published catalog"),
    ...results.map(({ name, digest, ok: fileOk }) => el("li", { class: fileOk ? "ok" : "bad" }, `${name}: `,
      el("code", { text: digest ? `${digest.slice(0, 23)}…` : "not loaded" }), fileOk ? " matches the manifest" : " does NOT match the manifest")),
  );
  track("apd_bundle_verified", { dataset_events: bundle.entry.events, verify_result: ok ? "match" : "mismatch" }, null);
}

function onDownload() {
  const { raw, entry, passport } = state.bundle;
  const blob = new Blob([raw["evidence-package.json"]], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = el("a", { href: url, download: `${passport.outcome.outcome_id.toLowerCase()}-evidence-package-${entry.events}-events.json` });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  track("apd_package_downloaded", { dataset_events: entry.events }, null);
}

// --- Numbers and meta ----------------------------------------------------------------------------

function renderNumbers() {
  const { entry, reconstruction, events } = state.bundle;
  const linked = engineLinks(reconstruction).linked;
  const grades = new Set(reconstruction.claims.map((c) => c.grade).filter(Boolean));
  const bench = state.benchmark?.results?.find((r) => r.events === entry.events);
  const metrics = [
    ["Synthetic events", formatCount(events.length), "Generated deterministically for one simulated day"],
    ["Connected systems", String(entry.systems), "Agent traces, identity, support & approvals, payments, ERP"],
    ["Records linked to the refund", String(linked.size), "Computed by the private engine for this dataset"],
    ["Evidence grades shown", String(grades.size), [...grades].map((g) => gradeMeta(g).label).join(" · ")],
  ];
  if (bench) {
    metrics.push(["Engine time, ingest and verify", `${formatCount(bench.ingest_ms)} ms`, "Median of measured runs"]);
    metrics.push(["Engine time, reconstruct", `${formatCount(bench.reconstruct_ms)} ms`, "Median of measured runs"]);
  }
  if (state.searchMs !== null) {
    metrics.push(["Keyword search in your browser", `${state.searchMs < 1 ? "<1" : Math.round(state.searchMs)} ms`, "Measured live on this device"]);
  }
  $("#synthetic-metrics").replaceChildren(...metrics.map(([term, value, note]) =>
    el("div", {}, el("dt", { text: term }), el("dd", {}, value, el("small", { text: note })))));
  const b = state.benchmark;
  $("#benchmark-note").replaceChildren(...(bench
    ? [`Engine timings were measured on ${b.measured_on} (${b.statistic} of ${b.repeats} runs, ${b.environment.system}, Python ${b.environment.python}) with `,
      el("code", { text: b.command }), `. ${b.environment.note}`]
    : ["Engine timings are not available for this dataset."]));
}

function renderMeta() {
  const { manifest, reconstruction } = state.bundle;
  $("#bundle-meta").textContent = `${manifest.bundle_version} · ${formatCount(manifest.dataset.events)} events · ${reconstruction.evaluation_id.slice(0, 13)}…`;
}

// --- Progress and observers ----------------------------------------------------------------------

function wireObservers() {
  if (!("IntersectionObserver" in window)) return;
  const steps = [...document.querySelectorAll(".apd-steps a")];
  const seen = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const id = entry.target.id;
      steps.forEach((a) => (a.dataset.step === id ? a.setAttribute("aria-current", "step") : a.removeAttribute("aria-current")));
      if (state.stage !== "reconstructed" || !state.bundle) continue;
      const size = { dataset_events: state.bundle.entry.events };
      if (id === "passport") track("apd_passport_viewed", size);
      if (id === "evidence") track("apd_demo_completed", size);
    }
  }, { rootMargin: "-35% 0px -55% 0px" });
  for (const id of ["ocean", "find", "passport", "revelation", "evidence"]) seen.observe($(`#${id}`));
}

// --- Start ---------------------------------------------------------------------------------------

async function start() {
  wireTooltip();
  wireObservers();
  $("#search-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.bundle) runSearch($("#query").value);
  });
  $("#search-result").addEventListener("click", (event) => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-query="outcome"]')) return;
    $("#query").value = `What happened to refund ${state.bundle.reconstruction.outcome.outcome_id}?`;
    runSearch($("#query").value);
  });
  $("#reveal").addEventListener("click", () => reveal());
  $("#verify").addEventListener("click", onVerify);
  $("#download").addEventListener("click", onDownload);
  $("#size-options").addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest("button[data-size]") : null;
    if (button && Number(button.dataset.size) !== state.bundle?.entry.events) selectDataset(Number(button.dataset.size));
  });
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!state.bundle) return;
      layout();
      state.styles = state.points.map(targetStyle);
      if (state.mode === "reconstructed") state.domain = zoomDomain();
      draw(state.styles);
    }, 150);
  });
  try {
    state.catalog = decode(await fetchBytes("catalog.json"));
  } catch (error) {
    setOceanState("Demo data unavailable");
    $("#size-note").replaceChildren(el("span", { class: "apd-notice", text: `The demo catalog could not be loaded (${error.message}).` }));
    return;
  }
  try {
    state.benchmark = decode(await fetchBytes("benchmark.json"));
  } catch (_) {
    state.benchmark = null;
  }
  const requested = Number(new URLSearchParams(location.search).get("events"));
  const initial = entryFor(requested) ? requested : state.catalog.default;
  await selectDataset(initial, true);
}

start();
