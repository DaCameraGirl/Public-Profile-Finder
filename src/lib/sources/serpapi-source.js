import {
  buildSearchPlans,
  mapSearchResultsToCandidates,
  mergeProfileCandidate,
  SUPPORTED_PROFILE_DOMAINS
} from "./profile-search-utils.js";

const DEFAULT_COUNTRY = "us";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_LOCATION = "United States";

function isNoResultsMessage(message) {
  const normalized = String(message || "").toLowerCase();
  return normalized.includes("hasn't returned any results") || normalized.includes("no results");
}

function buildQuery(plan) {
  const domains = plan.domains?.length ? plan.domains : SUPPORTED_PROFILE_DOMAINS;
  const siteFilter = domains.map((domain) => `site:${domain}`).join(" OR ");
  return `${plan.q} (${siteFilter})`;
}

function buildImageMatchPlans(query) {
  return (query.photoSourceUrls || []).slice(0, 2).map((imageUrl, index) => {
    let imageLabel = `image ${index + 1}`;

    try {
      const url = new URL(imageUrl);
      imageLabel = url.pathname.split("/").filter(Boolean).at(-1) || imageLabel;
    } catch {
      // Keep fallback label when the URL cannot be parsed.
    }

    return {
      label: `Photo exact matches ${imageLabel}`,
      imageUrl,
      photoFingerprints: query.photoHints[index] ? [query.photoHints[index]] : []
    };
  });
}

async function fetchPlanResults(plan, apiKey) {
  const params = new URLSearchParams({
    engine: "google",
    q: buildQuery(plan),
    api_key: apiKey,
    num: "20",
    hl: DEFAULT_LANGUAGE,
    gl: DEFAULT_COUNTRY,
    safe: "active",
    location: DEFAULT_LOCATION
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SerpApi returned ${response.status}`);
  }

  const payload = await response.json();

  if (payload.error) {
    if (isNoResultsMessage(payload.error)) {
      return [];
    }

    throw new Error(payload.error);
  }

  return payload.organic_results || [];
}

async function fetchImageMatchResults(plan, apiKey) {
  const params = new URLSearchParams({
    engine: "google_lens",
    type: "exact_matches",
    url: plan.imageUrl,
    api_key: apiKey,
    hl: DEFAULT_LANGUAGE,
    country: DEFAULT_COUNTRY,
    safe: "active"
  });

  const response = await fetch(`https://serpapi.com/search.json?${params}`, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`SerpApi returned ${response.status}`);
  }

  const payload = await response.json();

  if (payload.error) {
    if (isNoResultsMessage(payload.error)) {
      return [];
    }

    throw new Error(payload.error);
  }

  return payload.exact_matches || [];
}

export function getSerpApiSourceStatus(apiKey) {
  return apiKey
    ? {
        id: "serpapi-google",
        label: "SerpApi",
        mode: "live",
        configured: true,
        note: "Live public-web search and direct public image exact matches are enabled through SerpApi."
      }
    : null;
}

export async function searchSerpApiProfiles(query, apiKey) {
  const plans = buildSearchPlans(query);
  const imagePlans = buildImageMatchPlans(query);

  if (!plans.length && !imagePlans.length) {
    return [];
  }

  const merged = new Map();
  const settledResults = await Promise.allSettled(
    [
      ...plans.map((plan) =>
        fetchPlanResults(plan, apiKey).then((results) => ({
          kind: "web",
          plan,
          results
        }))
      ),
      ...imagePlans.map((plan) =>
        fetchImageMatchResults(plan, apiKey).then((results) => ({
          kind: "image",
          plan,
          results
        }))
      )
    ]
  );

  const successfulResults = settledResults
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);

  if (!successfulResults.length) {
    const firstRejectedResult = settledResults.find((result) => result.status === "rejected");
    if (firstRejectedResult?.reason) {
      throw firstRejectedResult.reason;
    }

    return [];
  }

  for (const { kind, plan, results } of successfulResults) {
    const candidates = mapSearchResultsToCandidates(
      results,
      plan,
      kind === "image"
        ? (result) => ({
            title: result.title,
            url: result.link,
            description: [result.source, result.snippet].filter(Boolean).join(" · "),
            extraSnippets: [],
            sourceLabel: "SerpApi Lens"
          })
        : (result) => ({
            title: result.title,
            url: result.link,
            description: result.snippet,
            extraSnippets: [],
            sourceLabel: "SerpApi"
          })
    );

    for (const candidate of candidates) {
      const existing = merged.get(candidate.profileUrl);
      if (existing) {
        merged.set(candidate.profileUrl, mergeProfileCandidate(existing, candidate));
      } else {
        merged.set(candidate.profileUrl, candidate);
      }
    }
  }

  return [...merged.values()];
}
