import { buildLocationTokens } from "./location.js";

const WEIGHTS = {
  exactProfileUrl: 48,
  exactHandle: 38,
  fuzzyHandle: 18,
  exactName: 24,
  nameToken: 8,
  bioKeyword: 5,
  locationOverlap: 12,
  locationConflict: 14,
  photoReuse: 20
};

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s./:-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/[\s,/_-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const DIRECT_IMAGE_URL_PATTERN = /\.(?:apng|avif|gif|jpe?g|png|webp)$/i;

function isDirectImageUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) && DIRECT_IMAGE_URL_PATTERN.test(url.pathname);
  } catch {
    return false;
  }
}

function photoFingerprint(url) {
  const normalized = normalizeText(url);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function sanitizePhotoHints(values) {
  return unique((values || []).filter(isDirectImageUrl).map(photoFingerprint));
}

function sanitizePhotoSourceUrls(values) {
  return unique((values || []).filter(isDirectImageUrl).map((value) => String(value).trim()));
}

function normalizeProfileUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    const isFacebookProfileId =
      ["facebook.com"].includes(hostname) &&
      url.pathname === "/profile.php" &&
      Boolean(url.searchParams.get("id"));

    url.protocol = "https:";
    url.hostname = hostname;
    url.hash = "";
    url.search = isFacebookProfileId ? `?id=${encodeURIComponent(url.searchParams.get("id"))}` : "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return String(value || "").trim().toLowerCase();
  }
}

function compactSignals(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== false);
}

function formatLocationMatches(tokens) {
  const visibleTokens = tokens.filter((token) => !token.startsWith("state:"));
  const canonicalStateTokens = visibleTokens.filter((token) => token.includes(" "));
  if (canonicalStateTokens.length > 0) {
    const withoutStateAbbreviations = visibleTokens.filter(
      (token) => token.length > 2 || !tokens.includes(`state:${token}`)
    );
    return withoutStateAbbreviations;
  }

  return visibleTokens;
}

function buildMatchTier(score, signals) {
  if (signals.nameConflict && signals.signalCount < 3) {
    return {
      key: "possible",
      label: "Conflicting clues"
    };
  }

  if (signals.exactProfileUrl || signals.exactHandle || signals.sharedPhotos.length > 0 || (signals.exactName && signals.signalCount >= 2)) {
    return {
      key: "high",
      label: "High confidence"
    };
  }

  if (score >= 40 || signals.signalCount >= 3) {
    return {
      key: "strong",
      label: "Strong match"
    };
  }

  return {
    key: "possible",
    label: "Possible match"
  };
}

function hasNonNameClues(query) {
  return Boolean(
    (query.profileUrls || []).length > 0 ||
    query.handles.length > 0 ||
      query.bioKeywords.length > 0 ||
      query.locationHints.length > 0 ||
      query.photoHints.length > 0
  );
}

function getStateTokens(values) {
  return values.filter((token) => token.startsWith("state:"));
}

function passesFilter(query, candidate, sourceMode) {
  const thresholds =
    sourceMode === "live"
      ? { minimumScore: 18, minimumSignals: 2 }
      : { minimumScore: 12, minimumSignals: 2 };

  const { signals } = candidate;

  if (signals.sharedPhotos.length > 0) {
    return true;
  }

  if (signals.exactProfileUrl) {
    return true;
  }

  if (signals.exactHandle && !signals.nameConflict) {
    return true;
  }

  if (signals.exactName) {
    if (sourceMode !== "live" || !hasNonNameClues(query)) {
      return true;
    }
  }

  if (signals.nameConflict && signals.signalCount < 3) {
    return false;
  }

  return candidate.score >= thresholds.minimumScore && signals.signalCount >= thresholds.minimumSignals;
}

export function sanitizeQuery(payload) {
  return {
    name: String(payload?.name || "").trim(),
    handles: unique((payload?.handles || []).map(normalizeText)),
    bioKeywords: unique((payload?.bioKeywords || []).flatMap(tokenize)),
    locationHints: buildLocationTokens(payload?.locationHints || []),
    photoHints: sanitizePhotoHints(payload?.photoHints || []),
    photoSourceUrls: sanitizePhotoSourceUrls(payload?.photoHints || []),
    profileUrls: unique((payload?.profileUrls || []).map(normalizeProfileUrl))
  };
}

export function scoreCandidate(query, candidate) {
  const reasons = [];
  let score = 0;
  let exactHandle = false;
  let fuzzyHandle = false;
  let exactName = false;
  let exactProfileUrl = false;
  let nameConflict = false;
  let locationConflict = false;

  const candidateHandle = normalizeText(candidate.username);
  const candidateName = normalizeText(candidate.displayName);
  const candidateProfileUrl = normalizeProfileUrl(candidate.profileUrl);
  const candidateBioTokens = new Set(tokenize(candidate.bio || candidate.publicText));
  const candidateLocationTokens = new Set(buildLocationTokens(candidate.location || candidate.publicText));
  const candidatePhotos = new Set([
    ...(candidate.photoUrls || []).map(photoFingerprint),
    ...((candidate.matchedPhotoFingerprints || []).map(photoFingerprint))
  ]);

  if ((query.profileUrls || []).includes(candidateProfileUrl)) {
    exactProfileUrl = true;
    score += WEIGHTS.exactProfileUrl;
    reasons.push("Exact public profile URL match");
  }

  if (query.handles.includes(candidateHandle)) {
    exactHandle = true;
    score += WEIGHTS.exactHandle;
    reasons.push(`Exact handle match on @${candidate.username}`);
  } else {
    const fuzzyHandleMatch = query.handles.find(
      (handle) => handle && candidateHandle && (candidateHandle.includes(handle) || handle.includes(candidateHandle))
    );

    if (fuzzyHandleMatch) {
      fuzzyHandle = true;
      score += WEIGHTS.fuzzyHandle;
      reasons.push(`Handle is close to ${fuzzyHandleMatch}`);
    }
  }

  if (query.name) {
    const queryName = normalizeText(query.name);
    if (queryName && queryName === candidateName) {
      exactName = true;
      score += WEIGHTS.exactName;
      reasons.push(`Exact public display name match`);
    } else {
      const sharedNameTokens = unique(tokenize(query.name)).filter((token) => candidateName.includes(token));
      if (sharedNameTokens.length > 0) {
        score += Math.min(WEIGHTS.exactName, sharedNameTokens.length * WEIGHTS.nameToken);
        reasons.push(`Shared name tokens: ${sharedNameTokens.join(", ")}`);
      } else if (query.handles.length > 0) {
        nameConflict = true;
      }
    }
  }

  const sharedBioTokens = query.bioKeywords.filter((token) => candidateBioTokens.has(token));
  if (sharedBioTokens.length > 0) {
    score += Math.min(15, sharedBioTokens.length * WEIGHTS.bioKeyword);
    reasons.push(`Bio overlap: ${sharedBioTokens.join(", ")}`);
  }

  const sharedLocationTokens = query.locationHints.filter((token) => candidateLocationTokens.has(token));
  if (sharedLocationTokens.length > 0) {
    score += WEIGHTS.locationOverlap;
    reasons.push(`Public location overlap: ${formatLocationMatches(sharedLocationTokens).join(", ")}`);
  }

  const queryStateTokens = getStateTokens(query.locationHints);
  const candidateStateTokens = getStateTokens([...candidateLocationTokens]);
  const sharedStateTokens = queryStateTokens.filter((token) => candidateLocationTokens.has(token));
  if (queryStateTokens.length > 0 && candidateStateTokens.length > 0 && sharedStateTokens.length === 0) {
    locationConflict = true;
    score = Math.max(0, score - WEIGHTS.locationConflict);
    reasons.push(`Public location points elsewhere: ${candidate.location || formatLocationMatches([...candidateLocationTokens]).join(", ")}`);
  }

  const sharedPhotos = query.photoHints.filter((fingerprint) => candidatePhotos.has(fingerprint));
  if (sharedPhotos.length > 0) {
    score += WEIGHTS.photoReuse;
    reasons.push(`Same public photo fingerprint: ${sharedPhotos.join(", ")}`);
  }

  const sharedNameTokens = exactName ? unique(tokenize(query.name)) : unique(tokenize(query.name)).filter((token) => candidateName.includes(token));
  if (nameConflict) {
    reasons.push(`Known handle and public name do not strongly align`);
  }

  const signals = {
    exactHandle,
    fuzzyHandle,
    exactName,
    exactProfileUrl,
    nameConflict,
    locationConflict,
    sharedNameTokens,
    sharedBioTokens,
    sharedLocationTokens,
    sharedPhotos,
    signalCount: compactSignals([
      exactHandle || fuzzyHandle,
      exactProfileUrl,
      exactName || sharedNameTokens.length > 0,
      sharedBioTokens.length > 0,
      sharedLocationTokens.length > 0,
      sharedPhotos.length > 0
    ]).length
  };
  const finalScore = Math.min(score, 100);

  return {
    ...candidate,
    score: finalScore,
    reasons,
    signals,
    matchTier: buildMatchTier(finalScore, signals)
  };
}

export function rankCandidates(rawQuery, candidates, options = {}) {
  const query = rawQuery?.photoSourceUrls !== undefined ? rawQuery : sanitizeQuery(rawQuery);
  const sourceMode = options.sourceMode || "demo";

  const scoredCandidates = candidates
    .map((candidate) => scoreCandidate(query, candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.platform.localeCompare(right.platform));

  const visibleResults = scoredCandidates.filter((candidate) => passesFilter(query, candidate, sourceMode));
  const hiddenResults = scoredCandidates.filter((candidate) => !passesFilter(query, candidate, sourceMode));
  const conflictingCandidateCount = scoredCandidates.filter((candidate) => candidate.signals.nameConflict).length;

  return {
    results: visibleResults,
    hiddenResults,
    meta: {
      scoredCandidateCount: scoredCandidates.length,
      hiddenCandidateCount: hiddenResults.length,
      conflictingCandidateCount,
      visibleCandidateCount: visibleResults.length,
      sourceMode,
      minimumSignals: sourceMode === "live" ? 2 : 2,
      minimumScore: sourceMode === "live" ? 18 : 12
    }
  };
}
