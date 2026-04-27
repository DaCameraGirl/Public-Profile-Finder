const WEIGHTS = {
  exactHandle: 38,
  fuzzyHandle: 18,
  exactName: 24,
  nameToken: 8,
  bioKeyword: 5,
  locationOverlap: 12,
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

function photoFingerprint(url) {
  const normalized = normalizeText(url);
  if (!normalized) {
    return "";
  }

  const segments = normalized.split("/");
  return segments[segments.length - 1] || normalized;
}

function compactSignals(values) {
  return values.filter((value) => value !== null && value !== undefined && value !== false);
}

function buildMatchTier(score, signals) {
  if (signals.exactHandle || signals.sharedPhotos.length > 0 || (signals.exactName && signals.signalCount >= 2)) {
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

function passesFilter(candidate, sourceMode) {
  const thresholds =
    sourceMode === "live"
      ? { minimumScore: 18, minimumSignals: 2 }
      : { minimumScore: 12, minimumSignals: 2 };

  const { signals } = candidate;

  if (signals.exactHandle || signals.exactName || signals.sharedPhotos.length > 0) {
    return true;
  }

  return candidate.score >= thresholds.minimumScore && signals.signalCount >= thresholds.minimumSignals;
}

export function sanitizeQuery(payload) {
  return {
    name: String(payload?.name || "").trim(),
    handles: unique((payload?.handles || []).map(normalizeText)),
    bioKeywords: unique((payload?.bioKeywords || []).flatMap(tokenize)),
    locationHints: unique((payload?.locationHints || []).flatMap(tokenize)),
    photoHints: unique((payload?.photoHints || []).map(photoFingerprint))
  };
}

export function scoreCandidate(query, candidate) {
  const reasons = [];
  let score = 0;
  let exactHandle = false;
  let fuzzyHandle = false;
  let exactName = false;

  const candidateHandle = normalizeText(candidate.username);
  const candidateName = normalizeText(candidate.displayName);
  const candidateBioTokens = new Set(tokenize(candidate.bio || candidate.publicText));
  const candidateLocationTokens = new Set(tokenize(candidate.location || candidate.publicText));
  const candidatePhotos = new Set((candidate.photoUrls || []).map(photoFingerprint));

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
    reasons.push(`Public location overlap: ${sharedLocationTokens.join(", ")}`);
  }

  const sharedPhotos = query.photoHints.filter((fingerprint) => candidatePhotos.has(fingerprint));
  if (sharedPhotos.length > 0) {
    score += WEIGHTS.photoReuse;
    reasons.push(`Same public photo fingerprint: ${sharedPhotos.join(", ")}`);
  }

  const sharedNameTokens = exactName ? unique(tokenize(query.name)) : unique(tokenize(query.name)).filter((token) => candidateName.includes(token));
  const signals = {
    exactHandle,
    fuzzyHandle,
    exactName,
    sharedNameTokens,
    sharedBioTokens,
    sharedLocationTokens,
    sharedPhotos,
    signalCount: compactSignals([
      exactHandle || fuzzyHandle,
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
  const query = sanitizeQuery(rawQuery);
  const sourceMode = options.sourceMode || "demo";

  const scoredCandidates = candidates
    .map((candidate) => scoreCandidate(query, candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.platform.localeCompare(right.platform));

  const visibleResults = scoredCandidates.filter((candidate) => passesFilter(candidate, sourceMode));
  const hiddenResults = scoredCandidates.filter((candidate) => !passesFilter(candidate, sourceMode));

  return {
    results: visibleResults,
    meta: {
      scoredCandidateCount: scoredCandidates.length,
      hiddenCandidateCount: hiddenResults.length,
      visibleCandidateCount: visibleResults.length,
      sourceMode,
      minimumSignals: sourceMode === "live" ? 2 : 2,
      minimumScore: sourceMode === "live" ? 18 : 12
    }
  };
}
