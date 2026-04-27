import { mockProfiles } from "../mock-data.js";

export function getMockSourceStatus() {
  return {
    id: "mock-demo",
    label: "Demo dataset",
    mode: "demo",
    configured: false,
    note: "Demo mode uses bundled sample public profiles until a live source is configured."
  };
}

export async function searchMockProfiles() {
  return mockProfiles;
}
