const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const resultMeta = document.querySelector("#result-meta");
const resultFlags = document.querySelector("#result-flags");
const demoButton = document.querySelector("#demo-button");
const sourceStatus = document.querySelector("#source-status");
const sourceNote = document.querySelector("#source-note");

const demoQuery = {
  name: "Maya Torres",
  handles: "maya.eats.bk, mayatorres",
  bioKeywords: "supper clubs, vintage, coffee",
  locationHints: "Brooklyn, NY",
  photoHints: "https://assets.example.com/uploads/maya-brunch-2024.jpg"
};

function splitList(value) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function readFormPayload() {
  const data = new FormData(form);

  return {
    name: String(data.get("name") || "").trim(),
    handles: splitList(String(data.get("handles") || "")),
    bioKeywords: splitList(String(data.get("bioKeywords") || "")),
    locationHints: splitList(String(data.get("locationHints") || "")),
    photoHints: splitList(String(data.get("photoHints") || ""))
  };
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

  resultFlags.innerHTML = parts.join("");
}

function renderResults(payload) {
  renderResultFlags(payload);

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

  results.innerHTML = payload.results
    .map((candidate) => {
      const reasons = candidate.reasons
        .map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`)
        .join("");
      const sourceQueries = (candidate.sourceQueries || [])
        .map((query) => `<span class="source-chip">${escapeHtml(query)}</span>`)
        .join("");

      return `
        <article class="result-card">
          <div class="result-top">
            <div>
              <h3>${escapeHtml(candidate.displayName)}</h3>
              <p class="handle">@${escapeHtml(candidate.username)} on ${escapeHtml(candidate.platform)}</p>
              <div class="card-badges">
                <span class="tier-chip ${escapeHtml(candidate.matchTier.key)}">${escapeHtml(candidate.matchTier.label)}</span>
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

async function runSearch(payload) {
  resultMeta.textContent = "Searching public profiles...";
  resultFlags.innerHTML = "";
  results.classList.add("empty");
  results.innerHTML = "<p>Scoring candidates...</p>";

  const response = await fetch("/api/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await runSearch(readFormPayload());
  } catch (error) {
    resultFlags.innerHTML = "";
    results.classList.add("empty");
    results.innerHTML = `<p>${escapeHtml(error.message || "Search failed.")}</p>`;
    resultMeta.textContent = "Search failed.";
  }
});

loadHealth().catch((error) => {
  sourceStatus.textContent = "Source check failed.";
  sourceNote.textContent = escapeHtml(error.message || "Unable to load source status.");
});
