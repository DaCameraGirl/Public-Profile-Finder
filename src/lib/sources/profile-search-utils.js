import { extractPublicLocation } from "../location.js";

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
  },
  {
    platform: "Facebook",
    domains: ["facebook.com", "m.facebook.com"],
    isProfilePath: (segments, urlValue) => {
      if (segments.length === 1 && segments[0] === "profile.php") {
        try {
          return Boolean(new URL(urlValue).searchParams.get("id"));
        } catch {
          return false;
        }
      }

      return (
        segments.length === 1 &&
        Boolean(segments[0]) &&
        ![
          "about",
          "business",
          "events",
          "gaming",
          "groups",
          "help",
          "login",
          "marketplace",
          "pages",
          "photo",
          "photos",
          "plugins",
          "policy",
          "profile.php",
          "public",
          "reel",
          "reels",
          "search",
          "settings",
          "share",
          "stories",
          "watch"
        ].includes(segments[0])
      );
    },
    extractUsername: (segments, urlValue) => {
      if (segments[0] === "profile.php") {
        try {
          return new URL(urlValue).searchParams.get("id") || "";
        } catch {
          return "";
        }
      }

      return segments[0];
    }
  },
  {
    platform: "GitHub",
    domains: ["github.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      ![
        "about",
        "account",
        "apps",
        "blog",
        "collections",
        "contact",
        "customer-stories",
        "enterprise",
        "events",
        "explore",
        "features",
        "gist",
        "issues",
        "login",
        "marketplace",
        "new",
        "notifications",
        "orgs",
        "organizations",
        "pricing",
        "pulls",
        "search",
        "security",
        "settings",
        "site",
        "sponsors",
        "team",
        "topics",
        "trending"
      ].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "LinkedIn",
    domains: ["linkedin.com"],
    isProfilePath: (segments) =>
      segments.length >= 2 &&
      ["in", "pub"].includes(segments[0]) &&
      Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  },
  {
    platform: "YouTube",
    domains: ["youtube.com"],
    isProfilePath: (segments) =>
      (segments.length === 1 && Boolean(segments[0]?.startsWith("@"))) ||
      (segments.length === 2 && ["c", "channel", "user"].includes(segments[0]) && Boolean(segments[1])),
    extractUsername: (segments) => (segments[0]?.startsWith("@") ? segments[0].slice(1) : segments[1])
  },
  {
    platform: "Bluesky",
    domains: ["bsky.app"],
    isProfilePath: (segments) => segments.length === 2 && segments[0] === "profile" && Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  },
  {
    platform: "Twitch",
    domains: ["twitch.tv"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["directory", "downloads", "jobs", "login", "p", "search", "settings", "store", "subscriptions"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Snapchat",
    domains: ["snapchat.com"],
    isProfilePath: (segments) => segments.length === 2 && segments[0] === "add" && Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  },
  {
    platform: "Linktree",
    domains: ["linktr.ee"],
    isProfilePath: (segments) => segments.length === 1 && Boolean(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "VSCO",
    domains: ["vsco.co"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["discover", "search", "signup", "home"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "SoundCloud",
    domains: ["soundcloud.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["charts", "discover", "jobs", "pages", "search", "settings", "stream", "upload", "you"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Behance",
    domains: ["behance.net"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["assets", "blog", "galleries", "joblist", "search"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Dribbble",
    domains: ["dribbble.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["attachments", "colors", "designers", "jobs", "learn", "search", "shots", "stories", "tags"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Medium",
    domains: ["medium.com"],
    isProfilePath: (segments) =>
      (segments.length === 1 && Boolean(segments[0]?.startsWith("@"))) ||
      (segments.length === 2 && segments[0] === "u" && Boolean(segments[1])),
    extractUsername: (segments) => (segments[0]?.startsWith("@") ? segments[0].slice(1) : segments[1])
  },
  {
    platform: "Patreon",
    domains: ["patreon.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["c", "explore", "home", "login", "posts", "pricing"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Ko-fi",
    domains: ["ko-fi.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["explore", "home", "login", "post", "s", "shop"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Flickr",
    domains: ["flickr.com"],
    isProfilePath: (segments) => segments.length >= 2 && segments[0] === "photos" && Boolean(segments[1]),
    extractUsername: (segments) => segments[1]
  },
  {
    platform: "Letterboxd",
    domains: ["letterboxd.com"],
    isProfilePath: (segments) =>
      segments.length === 1 &&
      Boolean(segments[0]) &&
      !["films", "lists", "reviews", "rss", "search", "service", "showdown", "tags"].includes(segments[0]),
    extractUsername: (segments) => segments[0]
  },
  {
    platform: "Goodreads",
    domains: ["goodreads.com"],
    isProfilePath: (segments) => segments.length >= 3 && segments[0] === "user" && segments[1] === "show" && Boolean(segments[2]),
    extractUsername: (segments) => segments[2]
  }
];

export const SUPPORTED_PROFILE_DOMAINS = PLATFORM_RULES.flatMap((rule) => rule.domains);
const BROADER_PROFILE_DOMAINS = ["github.com", "linkedin.com", "youtube.com", "reddit.com"];
const SOCIAL_PROFILE_DOMAINS = [
  "facebook.com",
  "instagram.com",
  "threads.net",
  "tiktok.com",
  "twitter.com",
  "x.com",
  "pinterest.com",
  "depop.com",
  "poshmark.com",
  "reddit.com",
  "bsky.app",
  "twitch.tv",
  "snapchat.com",
  "linktr.ee",
  "vsco.co",
  "soundcloud.com",
  "behance.net",
  "dribbble.com",
  "medium.com",
  "patreon.com",
  "ko-fi.com",
  "flickr.com",
  "letterboxd.com",
  "goodreads.com"
];

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

function normalizePhotoFingerprint(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .trim();

  if (!normalized) {
    return "";
  }

  const withoutQuery = normalized.split(/[?#]/, 1)[0];
  const segments = withoutQuery.split("/");
  return segments[segments.length - 1] || withoutQuery;
}

function buildPhotoSearchTerms(fingerprint) {
  const normalized = normalizePhotoFingerprint(fingerprint);
  if (!normalized) {
    return [];
  }

  return [
    {
      label: `Photo filename ${normalized}`,
      q: `"${normalized}"`,
      photoFingerprints: [normalized]
    }
  ];
}

function buildLocationSearchTerms(locationHints) {
  const stateTokens = new Set(
    locationHints
      .filter((token) => token.startsWith("state:"))
      .map((token) => token.replace(/^state:/, ""))
  );

  return dedupe(
    locationHints.filter((token) => {
      if (!token || token.startsWith("state:")) {
        return false;
      }

      return token.length > 2 || !stateTokens.has(token);
    })
  );
}

function buildProfileUrlSearchPlans(profileUrls) {
  return profileUrls.slice(0, 4).flatMap((profileUrl) => {
    try {
      const url = new URL(profileUrl);
      const hostname = normalizeHostname(url.hostname);
      const path = `${url.pathname}${url.search}`.replace(/\/$/, "");
      const searchableValue = `${hostname}${path}`;

      return searchableValue
        ? [
            {
              label: `Known profile URL ${hostname}`,
              q: clipText(`"${searchableValue}"`, 220),
              domains: [hostname]
            }
          ]
        : [];
    } catch {
      return [];
    }
  });
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
  const hostname = normalizeHostname(url.hostname);
  const isFacebookProfileId =
    ["facebook.com", "m.facebook.com"].includes(hostname) &&
    url.pathname === "/profile.php" &&
    Boolean(url.searchParams.get("id"));

  url.hash = "";
  if (isFacebookProfileId) {
    url.search = `?id=${encodeURIComponent(url.searchParams.get("id"))}`;
  } else {
    url.search = "";
  }

  return url.toString().replace(/\/$/, "");
}

export function parseKnownProfileUrl(urlValue) {
  const rule = getPlatformRule(urlValue);
  if (!rule) {
    return null;
  }

  const segments = getUrlSegments(urlValue);
  if (!rule.isProfilePath(segments, urlValue)) {
    return null;
  }

  const username = cleanText(rule.extractUsername(segments, urlValue) || "");
  if (!username) {
    return null;
  }

  return {
    platform: rule.platform,
    username,
    profileUrl: toCanonicalProfileUrl(urlValue)
  };
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
  const locationTerms = buildLocationSearchTerms(query.locationHints);
  plans.push(...buildProfileUrlSearchPlans(query.profileUrls || []));

  for (const handle of query.handles.slice(0, 4)) {
    plans.push({
      label: `Handle ${handle}`,
      q: buildHandleQuery(handle)
    });
  }

  for (const photoHint of query.photoHints.slice(0, 2)) {
    const photoPlans = buildPhotoSearchTerms(photoHint).map((plan) => ({
      ...plan,
      q: clipText(query.name ? `"${query.name}" ${plan.q}` : plan.q, 220)
    }));

    plans.push(...photoPlans);
  }

  if (query.name) {
    plans.push({
      label: "Name exact",
      q: clipText(`"${query.name}"`, 220)
    });

    plans.push({
      label: "Name on social profiles",
      q: clipText(`"${query.name}"`, 220),
      domains: SOCIAL_PROFILE_DOMAINS
    });

    plans.push({
      label: "Name on broader public profiles",
      q: clipText(`"${query.name}"`, 220),
      domains: BROADER_PROFILE_DOMAINS
    });

    if (locationTerms.length > 0) {
      plans.push({
        label: "Name and location",
        q: clipText(`"${query.name}" ${locationTerms.slice(0, 3).map((term) => `"${term}"`).join(" ")}`, 220)
      });
    }

    if (query.bioKeywords.length > 0) {
      plans.push({
        label: "Name and keywords",
        q: clipText(`"${query.name}" ${query.bioKeywords.slice(0, 4).join(" ")}`, 220)
      });
    }
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

  return dedupe(plans.map((plan) => JSON.stringify(plan))).map((plan) => JSON.parse(plan)).slice(0, 8);
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
    if (!rule.isProfilePath(segments, mapped.url)) {
      continue;
    }

    const username = cleanText(rule.extractUsername(segments, mapped.url) || "");
    if (!username) {
      continue;
    }

    const description = cleanText([mapped.description, ...(mapped.extraSnippets || [])].filter(Boolean).join(" "));
    const publicLocation = extractPublicLocation([mapped.title, description].filter(Boolean).join(" "));
    const profileUrl = toCanonicalProfileUrl(mapped.url);
    const candidate = {
      id: `${rule.platform.toLowerCase()}-${username.toLowerCase()}`,
      platform: rule.platform,
      profileUrl,
      displayName: cleanSearchTitle(mapped.title, username, rule.platform),
      username,
      bio: description,
      location: publicLocation,
      photoUrls: [],
      matchedPhotoFingerprints: plan.photoFingerprints || [],
      publicText: cleanText([mapped.title, description].filter(Boolean).join(" ")),
      sourceLabel: mapped.sourceLabel,
      sourceQuery: plan.label,
      sourceQueries: [plan.label]
    };

    const existing = merged.get(profileUrl);
    if (existing) {
      merged.set(profileUrl, mergeProfileCandidate(existing, candidate));
    } else {
      merged.set(profileUrl, candidate);
    }
  }

  return [...merged.values()];
}

export function mergeProfileCandidate(existing, candidate) {
  return {
    ...existing,
    displayName: candidate.displayName.length > existing.displayName.length ? candidate.displayName : existing.displayName,
    bio: candidate.bio.length > existing.bio.length ? candidate.bio : existing.bio,
    publicText: candidate.publicText.length > existing.publicText.length ? candidate.publicText : existing.publicText,
    location: candidate.location.length > existing.location.length ? candidate.location : existing.location,
    matchedPhotoFingerprints: dedupe([
      ...(existing.matchedPhotoFingerprints || []),
      ...(candidate.matchedPhotoFingerprints || [])
    ]),
    sourceQueries: dedupe([...(existing.sourceQueries || []), ...(candidate.sourceQueries || [])])
  };
}

export function hasSearchClues(query) {
  return Boolean(
    query.name ||
      (query.profileUrls || []).length > 0 ||
      query.handles.length > 0 ||
      query.bioKeywords.length > 0 ||
      query.locationHints.length > 0 ||
      query.photoHints.length > 0
  );
}
