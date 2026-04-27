import { buildSearchPlans, dedupe, mapSearchResultsToCandidates, SUPPORTED_PROFILE_DOMAINS } from "./profile-search-utils.js";

const DEFAULT_COUNTRY = "us";
const DEFAULT_LANGUAGE = "en";
const DEFAULT_LOCATION = "United States";

function buildQuery(plan) {
  const siteFilter = SUPPORTED_PROFILE_DOMAINS.map((domain) => `site:${domain}`).join(" OR ");
  return `${plan.q} (${siteFilter})`;
}

async function fetchPlanResults(plan, apiKey) {
  const params = new URLSearchParams({
    engine: "google",
    q: buildQuery(plan),
    api_key: apiKey,
    num: "10",
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
    throw new Error(payload.error);
  }

  return payload.organic_results || [];
}

export function getSerpApiSourceStatus(apiKey) {
  return apiKey
    ? {
        id: "serpapi-google",
        label: "SerpApi",
        mode: "live",
        configured: true,
        note: "Live public-web search is enabled through SerpApi's Google results."
      }
    : null;
}

export async function searchSerpApiProfiles(query, apiKey) {
  const plans = buildSearchPlans(query);
  if (!plans.length) {
    return [];
  }

  const merged = new Map();
  const settledResults = await Promise.all(
    plans.map((plan) => fetchPlanResults(plan, apiKey).then((results) => ({ plan, results })))
  );

  for (const { plan, results } of settledResults) {
    const candidates = mapSearchResultsToCandidates(results, plan, (result) => ({
      title: result.title,
      url: result.link,
      description: result.snippet,
      extraSnippets: [],
      sourceLabel: "SerpApi"
    }));

    for (const candidate of candidates) {
      const existing = merged.get(candidate.profileUrl);
      if (existing) {
        merged.set(candidate.profileUrl, {
          ...existing,
          bio: candidate.bio.length > existing.bio.length ? candidate.bio : existing.bio,
          publicText: candidate.publicText.length > existing.publicText.length ? candidate.publicText : existing.publicText,
          sourceQueries: dedupe([...(existing.sourceQueries || []), ...(candidate.sourceQueries || [])])
        });
      } else {
        merged.set(candidate.profileUrl, candidate);
      }
    }
  }

  return [...merged.values()];
}
