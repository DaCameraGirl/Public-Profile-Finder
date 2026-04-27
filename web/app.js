const form = document.querySelector("#search-form");
const results = document.querySelector("#results");
const resultMeta = document.querySelector("#result-meta");
const demoButton = document.querySelector("#demo-button");

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

function renderResults(payload) {
  if (!payload.results.length) {
    results.classList.add("empty");
    results.innerHTML = "<p>No public candidates matched these inputs.</p>";
    resultMeta.textContent = "0 candidates found.";
    return;
  }

  results.classList.remove("empty");
  resultMeta.textContent = `${payload.resultCount} candidate${payload.resultCount === 1 ? "" : "s"} found.`;

  results.innerHTML = payload.results
    .map((candidate) => {
      const reasons = candidate.reasons
        .map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`)
        .join("");

      return `
        <article class="result-card">
          <div class="result-top">
            <div>
              <h3>${escapeHtml(candidate.displayName)}</h3>
              <p class="handle">@${escapeHtml(candidate.username)} on ${escapeHtml(candidate.platform)}</p>
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
          <div class="reason-list">${reasons}</div>
        </article>
      `;
    })
    .join("");
}

async function runSearch(payload) {
  resultMeta.textContent = "Searching mock public profiles...";
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
  renderResults(result);
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
    results.classList.add("empty");
    results.innerHTML = `<p>${escapeHtml(error.message || "Search failed.")}</p>`;
    resultMeta.textContent = "Search failed.";
  }
});
