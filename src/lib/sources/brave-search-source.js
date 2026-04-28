import { buildSearchPlans, mapSearchResultsToCandidates, mergeProfileCandidate } from "./profile-search-utils.js";

const DEFAULT_COUNTRY = "US";
const DEFAULT_LANGUAGE = "en";

async function fetchPlanResults(plan, apiKey) {
  const params = new URLSearchParams({
    q: plan.q,
    count: "10",
    country: DEFAULT_COUNTRY,
    search_lang: DEFAULT_LANGUAGE,
    safesearch: "moderate",
    extra_snippets: "true"
  });

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey
    }
  });

  if (!response.ok) {
    throw new Error(`Brave Search API returned ${response.status}`);
  }

  const payload = await response.json();
  return payload?.web?.results || [];
}

export function getBraveSourceStatus(apiKey) {
  return apiKey
    ? {
        id: "brave-search",
        label: "Brave Search API",
        mode: "live",
        configured: true,
        note: "Live public-web search is enabled through Brave Search."
      }
    : null;
}

export async function searchBraveProfiles(query, apiKey) {
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
      url: result.url,
      description: result.description,
      extraSnippets: result.extra_snippets || [],
      sourceLabel: "Brave Search API"
    }));

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
