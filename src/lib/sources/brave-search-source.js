const PLATFORM_RULES = [
  {
    platform: "Instagram",
    domains: ["instagram.com"],
    isProfilePath: (segments) =>
      Boolean(segments[0]) && !["p", "reel", "reels", "stories", "explore", "accounts"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "TikTok",
    domains: ["tiktok.com"],
    isProfilePath: (segments) => Boolean(segments[0]?.startsWith("@")) && segments[1] !== "video",
    extractUsername: (segments) => segments[0]?.replace(/^@/, "")
  },
  {
    platform: "X",
    domains: ["x.com", "twitter.com"],
    isProfilePath: (segments) =>
      Boolean(segments[0]) &&
      !["home", "explore", "search", "i", "intent", "share", "settings", "messages", "compose"].includes(segments[0]) &&
      segments[1] !== "status",
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Threads",
    domains: ["threads.net"],
    isProfilePath: (segments) => Boolean(segments[0]?.startsWith("@")) && segments[1] !== "post",
    extractUsername: (segments) => segments[0]?.replace(/^@/, "")
  },
  {
    platform: "Pinterest",
    domains: ["pinterest.com"],
    isProfilePath: (segments) => Boolean(segments[0]) && !["pin", "ideas", "search"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Poshmark",
    domains: ["poshmark.com"],
    isProfilePath: (segments) =>
      (segments[0] === "closet" && Boolean(segments[1])) || (Boolean(segments[0]) && !["listing", "category"].includes(segments[0])),
    extractUsername: (segments) => (segments[0] === "closet" ? segments[1] : segments[0])
  },
  {
    platform: "Depop",
    domains: ["depop.com"],
    isProfilePath: (segments) => Boolean(segments[0]) && segments[0] !== "products",
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Reddit",
    domains: ["reddit.com"],
    isProfilePath: (segments) => ["user", "u"].includes(segments[0]) && Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  }
];

const DEFAULT_COUNTRY = "US";
const DEFAULT_LANGUAGE = "en";

function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}…` : value;
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
}

function buildSearchPlans(query) {
  const plans = [];

  for (const handle of query.handles.slice(0, 4)) {
    plans.push({
      label: `Handle ${handle}`,
      q: `"${handle}"`
    });
  }

  if (query.name) {
    const terms = [
      `"${query.name}"`,
      ...query.bioKeywords.slice(0, 3),
      ...query.locationHints.slice(0, 2)
    ].filter(Boolean);

    plans.push({
      label: "Name and public clues",
      q: clipText(terms.join(" "), 220)
    });
  }

  if (!plans.length) {
    const fallbackTerms = [...query.bioKeywords.slice(0, 4), ...query.locationHints.slice(0, 3)].filter(Boolean);

    if (fallbackTerms.length > 0) {
      plans.push({
        label: "Keywords only",
        q: clipText(fallbackTerms.join(" "), 220)
      });
    }
  }

  return dedupe(plans.map((plan) => JSON.stringify(plan))).map((plan) => JSON.parse(plan));
}

function getPlatformRule(urlValue) {
  try {
    const url = new URL(urlValue);
    const hostname = normalizeHostname(url.hostname);
    return PLATFORM_RULES.find((rule) => rule.domains.includes(hostname)) || null;
  } catch {
    return null;
  }
}

function getUrlSegments(urlValue) {
  try {
    const url = new URL(urlValue);
    return url.pathname
      .split("/")
      .map((segment) => segment.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function toCanonicalProfileUrl(urlValue) {
  const url = new URL(urlValue);
  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

function cleanSearchTitle(title, username, platform) {
  const compactTitle = cleanText(title);
  const pieces = compactTitle
    .split(/ [|•-] /)
    .map((piece) => piece.trim())
    .filter(Boolean);

  const preferredPiece =
    pieces.find((piece) => !piece.toLowerCase().includes(platform.toLowerCase())) || pieces[0] || compactTitle;

  const withoutHandle = preferredPiece.replace(/\(@?[A-Za-z0-9._-]+\)/g, "").trim();
  if (withoutHandle) {
    return withoutHandle;
  }

  return username ? username.replace(/[._-]+/g, " ") : compactTitle;
}

function toCandidate(result, plan) {
  const rule = getPlatformRule(result.url);
  if (!rule) {
    return null;
  }

  const segments = getUrlSegments(result.url);
  if (!rule.isProfilePath(segments)) {
    return null;
  }

  const username = cleanText(rule.extractUsername(segments) || "");
  if (!username) {
    return null;
  }

  const description = cleanText([result.description, ...(result.extra_snippets || [])].filter(Boolean).join(" "));
  const title = cleanSearchTitle(result.title, username, rule.platform);

  return {
    id: `${rule.platform.toLowerCase()}-${username.toLowerCase()}`,
    platform: rule.platform,
    profileUrl: toCanonicalProfileUrl(result.url),
    displayName: title,
    username,
    bio: description,
    location: "",
    photoUrls: [],
    publicText: cleanText([result.title, description].filter(Boolean).join(" ")),
    sourceLabel: "Brave Search API",
    sourceQuery: plan.label
  };
}

function mergeCandidateDetails(current, incoming) {
  const sourceQueries = dedupe([...(current.sourceQueries || [current.sourceQuery]), ...(incoming.sourceQueries || [incoming.sourceQuery])]);

  return {
    ...current,
    bio: incoming.bio.length > current.bio.length ? incoming.bio : current.bio,
    publicText:
      incoming.publicText.length > current.publicText.length ? incoming.publicText : current.publicText,
    sourceQueries
  };
}

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
        note: "Live public-web search is enabled for supported profile domains."
      }
    : {
        id: "mock-demo",
        label: "Demo dataset",
        mode: "demo",
        configured: false,
        note: "No Brave API key is configured, so searches fall back to demo results."
      };
}

export async function searchBraveProfiles(query, apiKey) {
  const plans = buildSearchPlans(query);
  if (!plans.length) {
    return [];
  }

  const settledResults = await Promise.all(plans.map((plan) => fetchPlanResults(plan, apiKey).then((results) => ({ plan, results }))));
  const merged = new Map();

  for (const { plan, results } of settledResults) {
    for (const result of results) {
      const candidate = toCandidate(result, plan);
      if (!candidate) {
        continue;
      }

      const key = candidate.profileUrl;
      const existing = merged.get(key);
      if (existing) {
        merged.set(key, mergeCandidateDetails(existing, candidate));
      } else {
        merged.set(key, {
          ...candidate,
          sourceQueries: [candidate.sourceQuery]
        });
      }
    }
  }

  return [...merged.values()];
}
