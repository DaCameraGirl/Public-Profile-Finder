const PLATFORM_RULES = [
  {
    platform: "Instagram",
    domains: ["instagram.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["p", "reel", "reels", "stories", "explore", "accounts"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "TikTok",
    domains: ["tiktok.com"],
    isProfilePath: (segments) => segments.length === 1 && Boolean(segments[0]?.startsWith("@")),
    extractUsername: (segments) => segments[0]?.replace(/^@/, "")
  },
  {
    platform: "X",
    domains: ["x.com", "twitter.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["home", "explore", "search", "i", "intent", "share", "settings", "messages", "compose"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Threads",
    domains: ["threads.net"],
    isProfilePath: (segments) => segments.length === 1 && Boolean(segments[0]?.startsWith("@")),
    extractUsername: (segments) => segments[0]?.replace(/^@/, "")
  },
  {
    platform: "Pinterest",
    domains: ["pinterest.com"],
    isProfilePath: (segments) => segments.length === 1 && Boolean(segments[0]) && !["pin", "ideas", "search"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Poshmark",
    domains: ["poshmark.com"],
    isProfilePath: (segments) =>
      (segments.length === 2 && segments[0] === "closet" && Boolean(segments[1])) ||
      (segments.length === 1 && Boolean(segments[0]) && !["listing", "category"].includes(segments[0])),
    extractUsername: (segments) => (segments[0] === "closet" ? segments[1] : segments[0])
  },
  {
    platform: "Depop",
    domains: ["depop.com"],
    isProfilePath: (segments) => segments.length === 1 && Boolean(segments[0]) && segments[0] !== "products",
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Reddit",
    domains: ["reddit.com"],
    isProfilePath: (segments) => segments.length === 2 && ["user", "u"].includes(segments[0]) && Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  }
];

export const SUPPORTED_PROFILE_DOMAINS = PLATFORM_RULES.flatMap((rule) => rule.domains);

export function dedupe(values) {
  return [...new Set(values.filter(Boolean))];
}

export function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function clipText(value, maxLength) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3).trim()}...` : value;
}

function normalizeHandleVariant(value) {
  return value.replace(/[^a-z0-9]/gi, "");
}

function buildHandleQuery(handle) {
  const variants = dedupe([
    handle,
    `@${handle}`,
    normalizeHandleVariant(handle)
  ]).filter((value) => value && value.length >= 3);

  return variants.map((value) => `"${value}"`).join(" OR ");
}

function normalizeHostname(hostname) {
  return hostname.toLowerCase().replace(/^www\./, "");
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
    .split(/ [|\u2022-] /)
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

export function buildSearchPlans(query) {
  const plans = [];

  for (const handle of query.handles.slice(0, 4)) {
    plans.push({
      label: `Handle ${handle}`,
      q: buildHandleQuery(handle)
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

export function mapSearchResultsToCandidates(results, plan, mapper) {
  const merged = new Map();

  for (const result of results) {
    const mapped = mapper(result);
    if (!mapped?.url) {
      continue;
    }

    const rule = getPlatformRule(mapped.url);
    if (!rule) {
      continue;
    }

    const segments = getUrlSegments(mapped.url);
    if (!rule.isProfilePath(segments)) {
      continue;
    }

    const username = cleanText(rule.extractUsername(segments) || "");
    if (!username) {
      continue;
    }

    const description = cleanText([mapped.description, ...(mapped.extraSnippets || [])].filter(Boolean).join(" "));
    const profileUrl = toCanonicalProfileUrl(mapped.url);
    const candidate = {
      id: `${rule.platform.toLowerCase()}-${username.toLowerCase()}`,
      platform: rule.platform,
      profileUrl,
      displayName: cleanSearchTitle(mapped.title, username, rule.platform),
      username,
      bio: description,
      location: "",
      photoUrls: [],
      publicText: cleanText([mapped.title, description].filter(Boolean).join(" ")),
      sourceLabel: mapped.sourceLabel,
      sourceQuery: plan.label,
      sourceQueries: [plan.label]
    };

    const existing = merged.get(profileUrl);
    if (existing) {
      merged.set(profileUrl, {
        ...existing,
        bio: candidate.bio.length > existing.bio.length ? candidate.bio : existing.bio,
        publicText: candidate.publicText.length > existing.publicText.length ? candidate.publicText : existing.publicText,
        sourceQueries: dedupe([...(existing.sourceQueries || []), ...candidate.sourceQueries])
      });
    } else {
      merged.set(profileUrl, candidate);
    }
  }

  return [...merged.values()];
}

export function hasSearchClues(query) {
  return Boolean(
    query.name ||
      query.handles.length > 0 ||
      query.bioKeywords.length > 0 ||
      query.locationHints.length > 0 ||
      query.photoHints.length > 0
  );
}
