(() => {
  "use strict";

  // Basic GA4 consent mode: no Google request before an affirmative choice.
  const config = window.FORKIT_SITE_CONFIG || {};
  const id = typeof config.ga4MeasurementId === "string" && /^G-[A-Z0-9]{6,20}$/.test(config.ga4MeasurementId)
    ? config.ga4MeasurementId : "";
  const key = "forkit_analytics_consent_v1";
  const safeEvents = new Set([
 "footprint_interest","reconstruct_click","reconstruct_launch","demo_developer","demo_enterprise",
 "enterprise_interest","contact_intent","developer_interest","footprint_install_copy",
 "reconstruct_run","reconstruct_scenario","passport_interest","github_click",
 "real_action_intent","partner_cta","reconstruction_started","reconstruction_completed",
 "share_builder_open","share_card_export","share_network_open","share_reconstruction_link",
 "beta_cta_clicked","beta_signup_started","beta_signup_completed",
 "beta_platform_macos","beta_platform_windows","beta_platform_linux",
 "action_passport_cta","apd_demo_started","apd_dataset_selected","apd_search","apd_reconstruction_viewed",
 "apd_passport_viewed","apd_bundle_verified","apd_package_downloaded","apd_demo_completed","apd_pilot_cta"
]);
  // Action Passport demo: only these categories may accompany its events. Never search text or IDs.
  const demoDatasetSizes = new Set([3000, 5000, 6000, 9000]);
  const demoSearchOutcomes = new Set(["refund_found", "other_match", "no_match", "no_identifier"]);
  const demoVerifyResults = new Set(["match", "mismatch"]);
  let consent = null;
  let started = false;
  let banner = null;

  try {
    const saved = localStorage.getItem(key);
    if (saved === "granted" || saved === "denied") consent = saved;
  } catch (_) { /* Storage may be disabled. No assumed consent. */ }

  function gtag() {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(Array.from(arguments));
  }

  function consentParams(analytics) {
    return {
      analytics_storage: analytics,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    };
  }

  function start() {
    if (!id || consent !== "granted" || started) return;
    started = true;
    window.gtag = gtag;
    gtag("consent", "default", consentParams("denied"));
    gtag("consent", "update", consentParams("granted"));
    gtag("js", new Date());
    gtag("config", id, {
      send_page_view: true,
      allow_google_signals: false,
      restricted_data_processing: true,
      allow_ad_personalization_signals: false
    });
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    tag.addEventListener("error", () => console.warn("Forkit AI: GA4 tag could not be loaded."));
    document.head.appendChild(tag);
    gtag("event","promotion_landing",{campaign_source:window.ForkitMarketingAttribution?.source||"direct",page_type:document.body?.dataset?.page||"unknown"});
  }

  function clearAnalyticsCookies() {
    // Best effort for cookies owned by this site; GA retention remains controlled in GA4.
    const names = document.cookie.split(";").map((cookie) => cookie.split("=")[0].trim());
    for (const name of names) {
      if (!/^_ga(?:_|$)|^_gid$|^_gat(?:_|$)/.test(name)) continue;
      for (const domain of ["", "; domain=forkit-ai.com", "; domain=.forkit-ai.com"]) {
        document.cookie = name + "=; Max-Age=0; path=/; SameSite=Lax" + domain;
      }
    }
  }

  function close() {
    if (banner) banner.remove();
    banner = null;
  }

  function save(next) {
    const wasActive = started;
    consent = next;
    try { localStorage.setItem(key, next); } catch (_) { /* Fail closed on next visit. */ }
    close();
    if (next === "granted") start();
    else if (wasActive) {
      gtag("consent", "update", consentParams("denied"));
      clearAnalyticsCookies();
      // Reload to remove the already-loaded Google tag from the page.
      location.reload();
    }
  }

  function openSettings() {
    if (!id) return; // No stream is configured: no consent is solicited.
    if (banner) {
      banner.querySelector('[data-analytics-consent="granted"]')?.focus();
      return;
    }
    banner = document.createElement("section");
    banner.className = "analytics-consent";
    banner.setAttribute("role", "region");
    banner.setAttribute("aria-label", "Optional analytics settings");
    banner.innerHTML = `
      <div class="analytics-consent-content">
        <strong>Optional website analytics</strong>
        <p>May we use Google Analytics to understand visits and interactions on this website?
        No Google Analytics script loads unless you choose Allow. Only anonymous website interaction categories are measured, never product evidence.
        We do not send AI prompts, code or local Footprint data.
        <a href="/privacy/">Privacy information</a></p>
      </div>
      <div class="analytics-consent-actions">
        <button type="button" data-analytics-consent="denied">Reject analytics</button>
        <button type="button" data-analytics-consent="granted">Allow analytics</button>
      </div>`;
    banner.querySelectorAll("[data-analytics-consent]").forEach((button) => {
      button.addEventListener("click", () => save(button.dataset.analyticsConsent));
    });
    document.body.appendChild(banner);
  }

  window.addEventListener("forkit:analytics", (e) => {
    if (consent !== "granted" || !started || !id) return;
    const detail = e.detail || {};
    if (!safeEvents.has(detail.name)) return;
    const params = { page_type: document.body?.dataset?.page || "unknown", campaign_source: window.ForkitMarketingAttribution?.source || "direct" };
    // Only the labels of simulated example scenarios may be sent.
    if (detail.name === "reconstruct_run" || detail.name === "reconstruct_scenario" || detail.name === "reconstruction_started" || detail.name === "reconstruction_completed") {
      if (["developer", "procurement"].includes(detail.meta?.scenario)) params.demo_scenario = detail.meta.scenario;
      if (detail.name === "reconstruct_run" && Number.isFinite(detail.meta?.coverage)) {
        params.demo_evidence_coverage = Math.max(0, Math.min(100, Math.round(detail.meta.coverage)));
      }
      if(detail.name==="reconstruction_completed"){
        for(const key of ["source_count","missing_count","conflict_count"]){const n=detail.meta?.[key];if(Number.isInteger(n)&&n>=0&&n<=10)params["demo_"+key]=n;}
      }
      params.simulated_example = true;
    }
    if (detail.name.startsWith("apd_")) {
      const meta = detail.meta || {};
      if (demoDatasetSizes.has(meta.dataset_events)) params.dataset_events = meta.dataset_events;
      if (demoSearchOutcomes.has(meta.search_outcome)) params.search_outcome = meta.search_outcome;
      if (demoVerifyResults.has(meta.verify_result)) params.verify_result = meta.verify_result;
      params.simulated_example = true;
    }
    gtag("event", detail.name, params);
  });

  function mount() {
    document.querySelectorAll("[data-cookie-settings]").forEach((button) => {
      button.addEventListener("click", openSettings);
    });
    if (id && consent === "granted") start();
    else if (id && consent === null) openSettings();
  }
  window.ForkitAnalyticsConsent = {
    openSettings,
    getStatus: () => id ? (consent || "unset") : "not_configured"
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount, { once: true });
  } else mount();
})();
