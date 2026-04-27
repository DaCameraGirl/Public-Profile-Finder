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

  const candidateHandle = normalizeText(candidate.username);
  const candidateName = normalizeText(candidate.displayName);
  const candidateBioTokens = new Set(tokenize(candidate.bio || candidate.publicText));
  const candidateLocationTokens = new Set(tokenize(candidate.location || candidate.publicText));
  const candidatePhotos = new Set((candidate.photoUrls || []).map(photoFingerprint));

  if (query.handles.includes(candidateHandle)) {
    score += WEIGHTS.exactHandle;
    reasons.push(`Exact handle match on @${candidate.username}`);
  } else {
    const fuzzyHandle = query.handles.find(
      (handle) => handle && candidateHandle && (candidateHandle.includes(handle) || handle.includes(candidateHandle))
    );

    if (fuzzyHandle) {
      score += WEIGHTS.fuzzyHandle;
      reasons.push(`Handle is close to ${fuzzyHandle}`);
    }
  }

  if (query.name) {
    const queryName = normalizeText(query.name);
    if (queryName && queryName === candidateName) {
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

  return {
    ...candidate,
    score: Math.min(score, 100),
    reasons
  };
}

export function rankCandidates(rawQuery, candidates) {
  const query = sanitizeQuery(rawQuery);

  return candidates
    .map((candidate) => scoreCandidate(query, candidate))
    .filter((candidate) => candidate.score > 0)
    .sort((left, right) => right.score - left.score || left.platform.localeCompare(right.platform));
}
