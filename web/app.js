const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const hiddenResultsWrap = document.querySelector("#hidden-results-wrap");
const resultMeta = document.querySelector("#result-meta");
const resultFlags = document.querySelector("#result-flags");
const demoButton = document.querySelector("#demo-button");
const clearButton = document.querySelector("#clear-button");
const nameOnlyButton = document.querySelector("#name-only-button");
const formWarning = document.querySelector("#form-warning");
const sourceStatus = document.querySelector("#source-status");
const sourceNote = document.querySelector("#source-note");
const DIRECT_IMAGE_URL_PATTERN = /\.(?:apng|avif|gif|jpe?g|png|webp)$/i;
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
  "goodreads.com"
];

const demoQuery = {
  name: "Maya Torres",
  handles: "maya.eats.bk, mayatorres",
  bioKeywords: "supper clubs, vintage, coffee",
  locationHints: "Brooklyn, NY",
  profileUrls: "",
  photoHints: "https://assets.example.com/uploads/maya-brunch-2024.jpg"
};

function splitList(value) {
  return value
    .split(",")
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

  sourceStatus.textContent =
    source.mode === "live"
      ? `Live source: ${source.label}`
      : `Demo mode: ${source.label}`;
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

function renderResultFlags(payload) {
  const parts = [
    `<span class="summary-chip ${escapeHtml(payload.source.mode)}">${escapeHtml(
      payload.source.mode === "live" ? "Live results" : "Demo results"
    )}</span>`,
    `<span class="summary-chip">${escapeHtml(payload.source.label)}</span>`
  ];

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

      return `
        <article class="result-card${toneClass}">
          <div class="result-top">
            <div>
              <h3>${escapeHtml(candidate.displayName)}</h3>
              <p class="handle">@${escapeHtml(candidate.username)} on ${escapeHtml(candidate.platform)}</p>
              <div class="card-badges">
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

function renderResults(payload) {
  renderResultFlags(payload);
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";

  if (!payload.results.length) {
    results.classList.add("empty");
    results.innerHTML = "<p>No strong public candidates matched these inputs.</p>";
    resultMeta.textContent =
      payload.hiddenCandidateCount > 0
        ? `0 visible matches via ${payload.source.label}. ${payload.hiddenCandidateCount} weak candidate${payload.hiddenCandidateCount === 1 ? "" : "s"} hidden.`
        : `0 visible matches via ${payload.source.label}.`;
    return;
  }

  results.classList.remove("empty");
  resultMeta.textContent =
    `${payload.resultCount} visible candidate${payload.resultCount === 1 ? "" : "s"} from ${payload.scoredCandidateCount} scored result${payload.scoredCandidateCount === 1 ? "" : "s"} via ${payload.source.label}.`;

  results.innerHTML = renderCandidateCards(payload.results);

  if (payload.hiddenResults?.length) {
    hiddenResultsWrap.hidden = false;
    hiddenResultsWrap.innerHTML = `
      <details class="hidden-results-panel">
        <summary>Show hidden weak matches (${escapeHtml(String(payload.hiddenResults.length))})</summary>
        <p class="hidden-results-note">These candidates scored too weakly for the main list, but you can still inspect them.</p>
        <div class="results hidden-results-list">
          ${renderCandidateCards(payload.hiddenResults, { toneClass: " weak-card", badgeLabel: "Weak match" })}
        </div>
      </details>
    `;
  }
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
    resultMeta.textContent = warnings.length > 0 ? "Search needs a usable clue." : "Search needs at least one clue.";
    return;
  }

  resultMeta.textContent = "Searching public profiles...";
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>Scoring candidates...</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";

  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(effectivePayload)
  });

  if (!response.ok) {
    let message = `Search failed with status ${response.status}`;

    try {
      const errorPayload = await response.json();
      message = errorPayload.detail || errorPayload.error || message;
    } catch {
      // Fall back to the generic message when the response is not JSON.
    }

    throw new Error(message);
  }

  const result = await response.json();
  renderSourceState(result.source);
  renderResults(result);
}

async function loadHealth() {
  const response = await fetch("/api/health");

  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }

  const payload = await response.json();
  renderSourceState(payload.source);
}

demoButton.addEventListener("click", () => {
  Object.entries(demoQuery).forEach(([key, value]) => {
    const input = form.querySelector(`[name="${key}"]`);
    if (input) {
      input.value = value;
    }
  });
});

clearButton.addEventListener("click", () => {
  form.reset();
  hideFormWarning();
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>No results yet.</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  resultMeta.textContent = "Run a search to see scored matches.";
});

nameOnlyButton.addEventListener("click", () => {
  useNameOnly();
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>Only the full name will be used on the next search.</p>";
  hiddenResultsWrap.hidden = true;
  hiddenResultsWrap.innerHTML = "";
  resultMeta.textContent = "Name-only search is ready.";
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
    resultMeta.textContent = "Search failed.";
  }
});

loadHealth().catch((error) => {
  sourceStatus.textContent = "Source check failed.";
  sourceNote.textContent = escapeHtml(error.message || "Unable to load source status.");
});
