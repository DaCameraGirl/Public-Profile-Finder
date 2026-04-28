import { mockProfiles } from "../src/lib/mock-data.js";
import { rankCandidates, sanitizeQuery } from "../src/lib/scoring.js";
import {
  buildSearchPlans,
  mergeProfileCandidate,
  parseKnownProfileUrl
} from "../src/lib/sources/profile-search-utils.js";

const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const hiddenResultsWrap = document.querySelector("#hidden-results-wrap");
const manualSearchWrap = document.querySelector("#manual-search-wrap");
const resultMeta = document.querySelector("#result-meta");
const resultFlags = document.querySelector("#result-flags");
const demoButton = document.querySelector("#demo-button");
const clearButton = document.querySelector("#clear-button");
const nameOnlyButton = document.querySelector("#name-only-button");
const formWarning = document.querySelector("#form-warning");
const sourceStatus = document.querySelector("#source-status");
const sourceNote = document.querySelector("#source-note");
const shareButton = document.querySelector("#share-button");
const qrButton = document.querySelector("#qr-button");
const installButton = document.querySelector("#install-button");
const qrPopup = document.querySelector("#qr-popup");
const qrClose = document.querySelector("#qr-close");
const qrImage = document.querySelector("#qr-image");
const qrCaption = document.querySelector("#qr-caption");

const DIRECT_IMAGE_URL_PATTERN = /\.(?:apng|avif|gif|jpe?g|png|webp)$/i;
const PUBLIC_RECORD_PLATFORMS = new Set(["CorporationWiki"]);
const PROFILE_PAGE_DOMAINS = [
  "linkedin.com",
  "facebook.com",
  "instagram.com",
  "x.com",
  "twitter.com",
  "tiktok.com",
  "threads.net",
  "github.com",
  "youtube.com",
  "pinterest.com",
  "reddit.com",
  "bsky.app",
  "twitch.tv",
  "snapchat.com",
  "linktr.ee",
  "vsco.co",
  "soundcloud.com",
  "behance.net",
  "dribbble.com",
  "medium.com",
  "patreon.com",
  "ko-fi.com",
  "flickr.com",
  "letterboxd.com",
  "goodreads.com",
  "corporationwiki.com"
];
const API_HEALTH_URL = new URL("../api/health", window.location.href);
const API_SEARCH_URL = new URL("../api/search", window.location.href);
const QR_SERVICE_URL = "https://api.qrserver.com/v1/create-qr-code/";

const demoQuery = {
  name: "Maya Torres",
  handles: "maya.eats.bk, mayatorres",
  bioKeywords: "supper clubs, vintage, coffee",
  locationHints: "Brooklyn, NY",
  profileUrls: "",
  photoHints: "https://assets.example.com/uploads/maya-brunch-2024.jpg"
};

const runtime = {
  backendAvailable: false,
  deferredPrompt: null,
  demoPrefillActive: false
};

function getStaticSourceStatus(useDemoDataset = false) {
  if (useDemoDataset) {
    return {
      id: "browser-demo",
      label: "Bundled demo dataset",
      mode: "demo",
      configured: false,
      note: "Running entirely in the browser with the bundled demo dataset and local scoring."
    };
  }

  return {
    id: "browser-only",
    label: "Browser-only tools",
    mode: "static",
    configured: false,
    note:
      "Running without a backend. Paste known public profile URLs to score them locally, or use the prepared manual search links below."
  };
}

function splitList(value) {
  return value
    .split(/[\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeList(values) {
  return values
    .map((value) => normalizeValue(value))
    .filter(Boolean)
    .sort();
}

function sameList(left, right) {
  return JSON.stringify(normalizeList(left)) === JSON.stringify(normalizeList(right));
}

function dedupeEntries(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function writeField(name, value) {
  const input = form.querySelector(`[name="${name}"]`);
  if (input) {
    input.value = value;
  }
}

function normalizeHost(hostname) {
  return String(hostname || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/^m\./, "");
}

function parseUrl(value) {
  try {
    return new URL(String(value || "").trim());
  } catch {
    return null;
  }
}

function isDirectImageUrl(value) {
  const url = parseUrl(value);
  return Boolean(url && ["http:", "https:"].includes(url.protocol) && DIRECT_IMAGE_URL_PATTERN.test(url.pathname));
}

function isKnownProfilePageUrl(value) {
  const url = parseUrl(value);
  if (!url) {
    return false;
  }

  return PROFILE_PAGE_DOMAINS.includes(normalizeHost(url.hostname)) && !DIRECT_IMAGE_URL_PATTERN.test(url.pathname);
}

function sanitizePhotoHints(payload) {
  const cleaned = {
    ...payload,
    profileUrls: [...payload.profileUrls],
    photoHints: []
  };
  const warnings = [];
  const invalidImageHints = [];
  const movedProfilePageHints = [];

  for (const hint of payload.photoHints) {
    if (isDirectImageUrl(hint)) {
      cleaned.photoHints.push(hint);
      continue;
    }

    if (isKnownProfilePageUrl(hint)) {
      cleaned.profileUrls.push(hint);
      movedProfilePageHints.push(hint);
      continue;
    }

    invalidImageHints.push(hint);
  }

  cleaned.photoHints = dedupeEntries(cleaned.photoHints);
  cleaned.profileUrls = dedupeEntries(cleaned.profileUrls);

  if (movedProfilePageHints.length > 0) {
    warnings.push("Moved profile page links out of the image field and into public profile URLs.");
  }

  if (invalidImageHints.length > 0) {
    warnings.push("Ignored photo hints that were not direct public image URLs.");
  }

  if (!sameList(cleaned.photoHints, payload.photoHints)) {
    writeField("photoHints", cleaned.photoHints.join(", "));
  }

  if (!sameList(cleaned.profileUrls, payload.profileUrls)) {
    writeField("profileUrls", cleaned.profileUrls.join(", "));
  }

  return {
    payload: cleaned,
    warnings
  };
}

function sanitizeProfileUrls(payload) {
  const cleaned = {
    ...payload,
    profileUrls: [],
    photoHints: [...payload.photoHints]
  };
  const warnings = [];
  const movedImageUrls = [];

  for (const hint of payload.profileUrls) {
    if (isDirectImageUrl(hint)) {
      cleaned.photoHints.push(hint);
      movedImageUrls.push(hint);
      continue;
    }

    cleaned.profileUrls.push(hint);
  }

  cleaned.profileUrls = dedupeEntries(cleaned.profileUrls);
  cleaned.photoHints = dedupeEntries(cleaned.photoHints);

  if (movedImageUrls.length > 0) {
    warnings.push("Moved direct image links out of public profile URLs and into the image field.");
  }

  if (!sameList(cleaned.profileUrls, payload.profileUrls)) {
    writeField("profileUrls", cleaned.profileUrls.join(", "));
  }

  if (!sameList(cleaned.photoHints, payload.photoHints)) {
    writeField("photoHints", cleaned.photoHints.join(", "));
  }

  return {
    payload: cleaned,
    warnings
  };
}

function hideFormWarning() {
  formWarning.hidden = true;
  formWarning.textContent = "";
}

function showFormWarning(message) {
  formWarning.hidden = false;
  formWarning.textContent = message;
}

function readFormPayload() {
  const data = new FormData(form);

  return {
    name: String(data.get("name") || "").trim(),
    handles: splitList(String(data.get("handles") || "")),
    bioKeywords: splitList(String(data.get("bioKeywords") || "")),
    locationHints: splitList(String(data.get("locationHints") || "")),
    profileUrls: splitList(String(data.get("profileUrls") || "")),
    photoHints: splitList(String(data.get("photoHints") || ""))
  };
}

function stripDemoArtifacts(payload) {
  const cleaned = {
    ...payload,
    handles: [...payload.handles],
    bioKeywords: [...payload.bioKeywords],
    locationHints: [...payload.locationHints],
    profileUrls: [...payload.profileUrls],
    photoHints: [...payload.photoHints]
  };

  const removed = [];
  const demoHandles = splitList(demoQuery.handles);
  const demoKeywords = splitList(demoQuery.bioKeywords);
  const demoLocations = splitList(demoQuery.locationHints);
  const demoPhotoHints = splitList(demoQuery.photoHints);
  const usingDifferentName = normalizeValue(payload.name) && normalizeValue(payload.name) !== normalizeValue(demoQuery.name);

  if (!usingDifferentName) {
    return {
      payload: cleaned,
      removed
    };
  }

  if (sameList(cleaned.handles, demoHandles)) {
    cleaned.handles = [];
    writeField("handles", "");
    removed.push("demo handles");
  }

  if (sameList(cleaned.bioKeywords, demoKeywords)) {
    cleaned.bioKeywords = [];
    writeField("bioKeywords", "");
    removed.push("demo keywords");
  }

  if (sameList(cleaned.locationHints, demoLocations)) {
    cleaned.locationHints = [];
    writeField("locationHints", "");
    removed.push("demo location");
  }

  if (
    sameList(cleaned.photoHints, demoPhotoHints) ||
    cleaned.photoHints.some((hint) => normalizeValue(hint).includes("assets.example.com"))
  ) {
    cleaned.photoHints = [];
    writeField("photoHints", "");
    removed.push("demo photo hint");
  }

  return {
    payload: cleaned,
    removed
  };
}

function useNameOnly() {
  const nameInput = form.querySelector('[name="name"]');
  const currentName = String(nameInput?.value || "").trim();
  runtime.demoPrefillActive = false;
  form.reset();
  writeField("name", currentName);
  hideFormWarning();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderSourceState(source) {
  if (!source) {
    sourceStatus.textContent = "Source status unavailable.";
    sourceNote.textContent = "Search source information could not be loaded.";
    return;
  }

  if (source.mode === "live") {
    sourceStatus.textContent = `Live source: ${source.label}`;
  } else if (source.mode === "demo") {
    sourceStatus.textContent = `Demo mode: ${source.label}`;
  } else {
    sourceStatus.textContent = `Browser mode: ${source.label}`;
  }

  sourceNote.textContent = source.note || "";
}

function hasUserClues(payload) {
  return Boolean(
    payload.name ||
      payload.handles.length ||
      payload.bioKeywords.length ||
      payload.locationHints.length ||
      payload.profileUrls.length ||
      payload.photoHints.length
  );
}

function getModeLabel(mode) {
  if (mode === "live") {
    return "Live results";
  }

  if (mode === "demo") {
    return "Demo results";
  }

  return "Browser-only mode";
}

function renderResultFlags(payload) {
  const modeClass = payload.source.mode === "live" ? "live" : payload.source.mode === "demo" ? "demo" : "static";
  const parts = [
    `<span class="summary-chip ${escapeHtml(modeClass)}">${escapeHtml(getModeLabel(payload.source.mode))}</span>`,
    `<span class="summary-chip">${escapeHtml(payload.source.label)}</span>`
  ];

  if (payload.manualPlans?.length) {
    parts.push(`<span class="summary-chip">Prepared searches: ${escapeHtml(String(payload.manualPlans.length))}</span>`);
  }

  if (payload.hiddenCandidateCount > 0) {
    parts.push(
      `<span class="summary-chip">Hidden weak matches: ${escapeHtml(String(payload.hiddenCandidateCount))}</span>`
    );
  }

  if (payload.conflictingCandidateCount > 0) {
    parts.push(
      `<span class="summary-chip">Conflicting clue hits: ${escapeHtml(String(payload.conflictingCandidateCount))}</span>`
    );
  }

  resultFlags.innerHTML = parts.join("");
}

function getCandidateCategory(candidate) {
  return PUBLIC_RECORD_PLATFORMS.has(candidate.platform) ? "record" : "profile";
}

function groupCandidatesByCategory(candidates) {
  return {
    profiles: candidates.filter((candidate) => getCandidateCategory(candidate) === "profile"),
    records: candidates.filter((candidate) => getCandidateCategory(candidate) === "record")
  };
}

function pluralize(word, count) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

function formatCandidateLabel(candidate) {
  return getCandidateCategory(candidate) === "record"
    ? `${candidate.username} on ${candidate.platform}`
    : `@${candidate.username} on ${candidate.platform}`;
}

function renderCandidateCards(candidates, options = {}) {
  const toneClass = options.toneClass ? ` ${options.toneClass}` : "";

  return candidates
    .map((candidate) => {
      const reasons = candidate.reasons
        .map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`)
        .join("");
      const sourceQueries = (candidate.sourceQueries || [])
        .map((query) => `<span class="source-chip">${escapeHtml(query)}</span>`)
        .join("");
      const extraBadge = options.badgeLabel
        ? `<span class="tier-chip weak">${escapeHtml(options.badgeLabel)}</span>`
        : "";
      const categoryBadge =
        getCandidateCategory(candidate) === "record"
          ? `<span class="tier-chip record-kind">Public record</span>`
          : `<span class="tier-chip profile-kind">Public profile</span>`;

      return `
        <article class="result-card${toneClass}">
          <div class="result-top">
            <div>
              <h3>${escapeHtml(candidate.displayName)}</h3>
              <p class="handle">${escapeHtml(formatCandidateLabel(candidate))}</p>
              <div class="card-badges">
                ${categoryBadge}
                <span class="tier-chip ${escapeHtml(candidate.matchTier.key)}">${escapeHtml(candidate.matchTier.label)}</span>
                ${extraBadge}
              </div>
            </div>
            <div class="score-pill">
              <strong>${candidate.score}</strong>
              <span>score</span>
            </div>
          </div>
          <div class="meta">
            <span>${escapeHtml(candidate.location || "No public location")}</span>
            <a href="${escapeHtml(candidate.profileUrl)}" target="_blank" rel="noreferrer">Open profile</a>
          </div>
          <p>${escapeHtml(candidate.bio || "No public bio")}</p>
          <div class="reason-list">${sourceQueries}</div>
          <div class="reason-list">${reasons}</div>
        </article>
      `;
    })
    .join("");
}

function renderResultSection(title, subtitle, candidates, options = {}) {
  if (!candidates.length) {
    return "";
  }

  return `
    <section class="result-section">
      <div class="result-section-header">
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(subtitle)}</p>
        </div>
        <span class="section-count">${escapeHtml(String(candidates.length))}</span>
      </div>
      <div class="results">
        ${renderCandidateCards(candidates, options)}
      </div>
    </section>
  `;
}

function buildSearchEngineQuery(plan) {
  const domainClause =
    plan.domains && plan.domains.length
      ? `(${plan.domains.slice(0, 4).map((domain) => `site:${domain}`).join(" OR ")})`
      : "";

  return [plan.q, domainClause].filter(Boolean).join(" ").trim();
}

function buildSearchEngineUrl(baseUrl, query) {
  return `${baseUrl}${encodeURIComponent(query)}`;
}

function renderManualSearch(plans, sourceMode) {
  if (!plans?.length) {
    manualSearchWrap.hidden = true;
    manualSearchWrap.innerHTML = "";
    return;
  }

  const note =
    sourceMode === "static"
      ? "GitHub Pages does not give you free paid-search API credits. These links open regular web searches using your clues."
      : "These extra search links can help you review public web results manually.";

  manualSearchWrap.hidden = false;
  manualSearchWrap.innerHTML = `
    <section class="manual-search-panel">
      <div class="result-section-header">
        <div>
          <h3>Manual Search Links</h3>
          <p>${escapeHtml(note)}</p>
        </div>
        <span class="section-count">${escapeHtml(String(plans.length))}</span>
      </div>
      <div class="manual-search-grid">
        ${plans
          .map((plan) => {
            const query = buildSearchEngineQuery(plan);
            const googleUrl = buildSearchEngineUrl("https://www.google.com/search?q=", query);
            const bingUrl = buildSearchEngineUrl("https://www.bing.com/search?q=", query);
            const duckUrl = buildSearchEngineUrl("https://duckduckgo.com/?q=", query);
            const domainChips = (plan.domains || [])
              .map((domain) => `<span class="domain-chip">${escapeHtml(domain)}</span>`)
              .join("");

            return `
              <article class="manual-search-card">
                <div class="manual-search-top">
                  <div>
                    <h4>${escapeHtml(plan.label)}</h4>
                    <p class="manual-query">${escapeHtml(query)}</p>
                  </div>
                </div>
                <div class="manual-domain-list">${domainChips}</div>
                <div class="manual-link-row">
                  <a class="manual-link" href="${escapeHtml(googleUrl)}" target="_blank" rel="noreferrer">Google</a>
                  <a class="manual-link" href="${escapeHtml(bingUrl)}" target="_blank" rel="noreferrer">Bing</a>
                  <a class="manual-link" href="${escapeHtml(duckUrl)}" target="_blank" rel="noreferrer">DuckDuckGo</a>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function renderResults(payload) {
  renderResultFlags(payload);
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  renderManualSearch(payload.manualPlans || [], payload.source.mode);

  if (!payload.results.length) {
    results.classList.add("empty");
    results.innerHTML = "<p>No strong local candidates matched these inputs yet.</p>";

    if (payload.manualPlans?.length) {
      resultMeta.textContent = `0 local matches. ${payload.manualPlans.length} manual search link${payload.manualPlans.length === 1 ? "" : "s"} ready.`;
    } else {
      resultMeta.textContent =
        payload.hiddenCandidateCount > 0
          ? `0 visible matches. ${payload.hiddenCandidateCount} weak candidate${payload.hiddenCandidateCount === 1 ? "" : "s"} hidden.`
          : "0 visible matches.";
    }

    return;
  }

  results.classList.remove("empty");
  const visibleGroups = groupCandidatesByCategory(payload.results);
  const hiddenGroups = groupCandidatesByCategory(payload.hiddenResults || []);
  resultMeta.textContent = `${pluralize("visible candidate", payload.resultCount)} from ${pluralize("scored result", payload.scoredCandidateCount)} via ${payload.source.label}. ${pluralize("public profile", visibleGroups.profiles.length)} and ${pluralize("public record", visibleGroups.records.length)}.`;

  results.innerHTML = [
    renderResultSection(
      "Public Profiles",
      "Public-facing social, community, or professional profile pages.",
      visibleGroups.profiles
    ),
    renderResultSection(
      "Public Records",
      "Business, corporate, or registry-style public records that may add context.",
      visibleGroups.records
    )
  ].join("");

  if (payload.hiddenResults?.length) {
    hiddenResultsWrap.hidden = false;
    hiddenResultsWrap.innerHTML = `
      <details class="hidden-results-panel">
        <summary>Show hidden weak matches (${escapeHtml(String(payload.hiddenResults.length))})</summary>
        <p class="hidden-results-note">These candidates scored too weakly for the main list, but you can still inspect them.</p>
        <div class="hidden-results-list">
          ${[
            renderResultSection(
              "Weak Public Profiles",
              "Low-signal profile pages that did not make the main list.",
              hiddenGroups.profiles,
              { toneClass: "weak-card", badgeLabel: "Weak match" }
            ),
            renderResultSection(
              "Weak Public Records",
              "Record-style hits that scored too weakly for the main list.",
              hiddenGroups.records,
              { toneClass: "weak-card", badgeLabel: "Weak match" }
            )
          ].join("")}
        </div>
      </details>
    `;
  }
}

function prettifyUsername(value) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSeedCandidate(hint) {
  return {
    id: `${hint.platform.toLowerCase()}-${hint.username.toLowerCase()}`,
    platform: hint.platform,
    profileUrl: hint.profileUrl,
    displayName: prettifyUsername(hint.username) || hint.username,
    username: hint.username,
    bio: "Known public profile URL provided as a clue.",
    location: "",
    photoUrls: [],
    matchedPhotoFingerprints: [],
    publicText: `${hint.platform} ${hint.username} ${hint.profileUrl}`,
    sourceLabel: "Known profile URL",
    sourceQuery: "Known profile URL",
    sourceQueries: ["Known profile URL"]
  };
}

function mergeCandidates(candidates) {
  const merged = new Map();

  for (const candidate of candidates) {
    const existing = merged.get(candidate.profileUrl);
    if (existing) {
      merged.set(candidate.profileUrl, mergeProfileCandidate(existing, candidate));
    } else {
      merged.set(candidate.profileUrl, candidate);
    }
  }

  return [...merged.values()];
}

function buildStaticPayload(payload) {
  const recognizedProfileHints = payload.profileUrls
    .map((profileUrl) => parseKnownProfileUrl(profileUrl))
    .filter(Boolean);
  const useDemoDataset = runtime.demoPrefillActive;
  const query = sanitizeQuery({
    ...payload,
    handles: [...payload.handles, ...recognizedProfileHints.map((hint) => hint.username)],
    profileUrls: payload.profileUrls
  });
  const seededCandidates = recognizedProfileHints.map((hint) => buildSeedCandidate(hint));
  const combinedCandidates = mergeCandidates([...seededCandidates, ...(useDemoDataset ? mockProfiles : [])]);
  const ranked = rankCandidates(query, combinedCandidates, {
    sourceMode: useDemoDataset ? "demo" : "static"
  });
  const manualPlans = buildSearchPlans(query);

  return {
    source: getStaticSourceStatus(useDemoDataset),
    query,
    recognizedProfileHints,
    candidateCount: combinedCandidates.length,
    scoredCandidateCount: ranked.meta.scoredCandidateCount,
    hiddenCandidateCount: ranked.meta.hiddenCandidateCount,
    conflictingCandidateCount: ranked.meta.conflictingCandidateCount,
    resultCount: ranked.results.length,
    filter: ranked.meta,
    results: ranked.results,
    hiddenResults: ranked.hiddenResults,
    manualPlans
  };
}

async function searchWithApi(payload) {
  const response = await fetch(API_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let message = `Search failed with status ${response.status}`;

    try {
      const errorPayload = await response.json();
      message = errorPayload.detail || errorPayload.error || message;
    } catch {
      // Keep the generic message.
    }

    throw new Error(message);
  }

  return response.json();
}

async function runSearch(payload) {
  hideFormWarning();

  const stripped = stripDemoArtifacts(payload);
  const warnings = [];
  let effectivePayload = stripped.payload;

  if (stripped.removed.length > 0) {
    warnings.push(`Ignored ${stripped.removed.join(", ")} left over from Load Demo.`);
  }

  const sanitizedProfiles = sanitizeProfileUrls(effectivePayload);
  effectivePayload = sanitizedProfiles.payload;
  warnings.push(...sanitizedProfiles.warnings);

  const sanitizedPhotos = sanitizePhotoHints(effectivePayload);
  effectivePayload = sanitizedPhotos.payload;
  warnings.push(...sanitizedPhotos.warnings);

  if (warnings.length > 0) {
    showFormWarning(warnings.join(" "));
  }

  if (!hasUserClues(effectivePayload)) {
    resultFlags.innerHTML = "";
    results.classList.add("empty");
    results.innerHTML =
      warnings.length > 0
        ? "<p>Search needs a usable clue. Direct photo hints must be public image URLs ending in .jpg, .jpeg, .png, .webp, or .gif.</p>"
        : "<p>Add at least a name, handle, location hint, keyword, public profile URL, or public photo URL.</p>";
    hiddenResultsWrap.hidden = true;
    hiddenResultsWrap.innerHTML = "";
    manualSearchWrap.hidden = true;
    manualSearchWrap.innerHTML = "";
    resultMeta.textContent = warnings.length > 0 ? "Search needs a usable clue." : "Search needs at least one clue.";
    return;
  }

  resultMeta.textContent = runtime.backendAvailable ? "Searching public profiles..." : "Building browser-side results...";
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = runtime.backendAvailable ? "<p>Scoring candidates...</p>" : "<p>Preparing search links and local scoring...</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  manualSearchWrap.hidden = true;
  manualSearchWrap.innerHTML = "";

  const result = runtime.backendAvailable ? await searchWithApi(effectivePayload) : buildStaticPayload(effectivePayload);
  renderSourceState(result.source);
  renderResults(result);
}

async function initializeSourceState() {
  try {
    const response = await fetch(API_HEALTH_URL);

    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}`);
    }

    const payload = await response.json();
    runtime.backendAvailable = true;
    renderSourceState(payload.source);
  } catch {
    runtime.backendAvailable = false;
    renderSourceState(getStaticSourceStatus(false));
  }
}

function buildAppUrl() {
  return new URL("./", window.location.href).href;
}

function buildQrUrl() {
  return `${QR_SERVICE_URL}?size=320x320&data=${encodeURIComponent(buildAppUrl())}&color=102034&bgcolor=f7f0e2&format=svg`;
}

function openQrPopup() {
  qrImage.src = buildQrUrl();
  qrImage.onerror = () => {
    qrImage.onerror = null;
    qrImage.src = `${QR_SERVICE_URL}?size=320x320&data=${encodeURIComponent(buildAppUrl())}`;
  };
  qrCaption.textContent = buildAppUrl();
  qrPopup.hidden = false;
}

function closeQrPopup() {
  qrPopup.hidden = true;
}

async function shareAppLink() {
  const url = buildAppUrl();

  if (navigator.share) {
    try {
      await navigator.share({
        title: "Public Profile Finder",
        text: "Open Public Profile Finder",
        url
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
    }
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    showFormWarning("App link copied to the clipboard.");
    return;
  }

  window.prompt("Copy this link", url);
}

function setupInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    runtime.deferredPrompt = event;
    installButton.hidden = false;
  });

  window.addEventListener("appinstalled", () => {
    runtime.deferredPrompt = null;
    installButton.hidden = true;
    showFormWarning("App installed.");
  });

  installButton.addEventListener("click", async () => {
    if (!runtime.deferredPrompt) {
      return;
    }

    runtime.deferredPrompt.prompt();
    await runtime.deferredPrompt.userChoice;
    runtime.deferredPrompt = null;
    installButton.hidden = true;
  });

  if ("serviceWorker" in navigator) {
    const serviceWorkerUrl = new URL("../sw.js", window.location.href);
    const serviceWorkerScope = new URL("../", window.location.href).pathname;

    navigator.serviceWorker.register(serviceWorkerUrl.href, { scope: serviceWorkerScope }).catch(() => {
      // Ignore registration failures in environments that do not support this flow.
    });
  }
}

demoButton.addEventListener("click", () => {
  Object.entries(demoQuery).forEach(([key, value]) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = value;
    }
  });

  runtime.demoPrefillActive = true;
  hideFormWarning();
  resultMeta.textContent = "Demo inputs loaded.";
});

clearButton.addEventListener("click", () => {
  runtime.demoPrefillActive = false;
  form.reset();
  hideFormWarning();
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>No results yet.</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  manualSearchWrap.hidden = true;
  manualSearchWrap.innerHTML = "";
  resultMeta.textContent = "Run a search to see scored matches.";
});

nameOnlyButton.addEventListener("click", () => {
  useNameOnly();
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>Only the full name will be used on the next search.</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  manualSearchWrap.hidden = true;
  manualSearchWrap.innerHTML = "";
  resultMeta.textContent = "Name-only search is ready.";
});

form.addEventListener("input", () => {
  runtime.demoPrefillActive = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await runSearch(readFormPayload());
  } catch (error) {
    resultFlags.innerHTML = "";
    results.classList.add("empty");
    results.innerHTML = `<p>${escapeHtml(error.message || "Search failed.")}</p>`;
    hiddenResultsWrap.hidden = true;
    hiddenResultsWrap.innerHTML = "";
    manualSearchWrap.hidden = true;
    manualSearchWrap.innerHTML = "";
    resultMeta.textContent = "Search failed.";
  }
});

shareButton.addEventListener("click", () => {
  shareAppLink().catch(() => {
    showFormWarning("Unable to share the app link from this browser.");
  });
});

qrButton.addEventListener("click", openQrPopup);
qrClose.addEventListener("click", closeQrPopup);
qrPopup.addEventListener("click", (event) => {
  if (event.target === qrPopup) {
    closeQrPopup();
  }
});

setupInstallPrompt();
initializeSourceState();
