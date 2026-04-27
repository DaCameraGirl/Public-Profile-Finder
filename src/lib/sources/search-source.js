import { searchBraveProfiles, getBraveSourceStatus } from "./brave-search-source.js";
import { searchMockProfiles, getMockSourceStatus } from "./mock-source.js";

export function getSourceStatus() {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();
  return apiKey ? getBraveSourceStatus(apiKey) : getMockSourceStatus();
}

export async function loadSourceCandidates(query) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY?.trim();

  if (apiKey) {
    return {
      source: getBraveSourceStatus(apiKey),
      candidates: await searchBraveProfiles(query, apiKey)
    };
  }

  return {
    source: getMockSourceStatus(),
    candidates: await searchMockProfiles(query)
  };
}
