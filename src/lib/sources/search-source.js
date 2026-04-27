import { searchMockProfiles, getMockSourceStatus } from "./mock-source.js";
import { searchBraveProfiles, getBraveSourceStatus } from "./brave-search-source.js";
import { searchSerpApiProfiles, getSerpApiSourceStatus } from "./serpapi-source.js";

export function getSourceStatus() {
  const serpApiKey = process.env.SERPAPI_API_KEY?.trim();
  if (serpApiKey) {
    return getSerpApiSourceStatus(serpApiKey);
  }

  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (braveApiKey) {
    return getBraveSourceStatus(braveApiKey);
  }

  return getMockSourceStatus();
}

export async function loadSourceCandidates(query) {
  const serpApiKey = process.env.SERPAPI_API_KEY?.trim();
  if (serpApiKey) {
    return {
      source: getSerpApiSourceStatus(serpApiKey),
      candidates: await searchSerpApiProfiles(query, serpApiKey)
    };
  }

  const braveApiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (braveApiKey) {
    return {
      source: getBraveSourceStatus(braveApiKey),
      candidates: await searchBraveProfiles(query, braveApiKey)
    };
  }

  return {
    source: getMockSourceStatus(),
    candidates: await searchMockProfiles(query)
  };
}
