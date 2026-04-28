const US_STATES = [
  ["al", "alabama"],
  ["ak", "alaska"],
  ["az", "arizona"],
  ["ar", "arkansas"],
  ["ca", "california"],
  ["co", "colorado"],
  ["ct", "connecticut"],
  ["de", "delaware"],
  ["fl", "florida"],
  ["ga", "georgia"],
  ["hi", "hawaii"],
  ["id", "idaho"],
  ["il", "illinois"],
  ["in", "indiana"],
  ["ia", "iowa"],
  ["ks", "kansas"],
  ["ky", "kentucky"],
  ["la", "louisiana"],
  ["me", "maine"],
  ["md", "maryland"],
  ["ma", "massachusetts"],
  ["mi", "michigan"],
  ["mn", "minnesota"],
  ["ms", "mississippi"],
  ["mo", "missouri"],
  ["mt", "montana"],
  ["ne", "nebraska"],
  ["nv", "nevada"],
  ["nh", "new hampshire"],
  ["nj", "new jersey"],
  ["nm", "new mexico"],
  ["ny", "new york"],
  ["nc", "north carolina"],
  ["nd", "north dakota"],
  ["oh", "ohio"],
  ["ok", "oklahoma"],
  ["or", "oregon"],
  ["pa", "pennsylvania"],
  ["ri", "rhode island"],
  ["sc", "south carolina"],
  ["sd", "south dakota"],
  ["tn", "tennessee"],
  ["tx", "texas"],
  ["ut", "utah"],
  ["vt", "vermont"],
  ["va", "virginia"],
  ["wa", "washington"],
  ["wv", "west virginia"],
  ["wi", "wisconsin"],
  ["wy", "wyoming"],
  ["dc", "district of columbia"]
];

const STATE_BY_ABBREV = new Map(US_STATES);
const STATE_NAME_BY_ABBREV = new Map(US_STATES.map(([abbrev, fullName]) => [abbrev.toUpperCase(), fullName]));

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const STATE_ABBREVIATION_PATTERN = US_STATES.map(([abbrev]) => escapeRegex(abbrev.toUpperCase())).join("|");
const STATE_NAME_PATTERN = US_STATES.map(([, fullName]) => fullName.split(" ").map(escapeRegex).join("\\s+")).join("|");
const CITY_STATE_PATTERN = new RegExp(
  `\\b([A-Z][A-Za-z'\\-]+(?: [A-Z][A-Za-z'\\-]+)*,\\s*(?:${STATE_ABBREVIATION_PATTERN}|${STATE_NAME_PATTERN})(?:,\\s*(?:United States|USA))?)\\b`,
  "g"
);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s,.:/-]/g, " ")
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

function getLastRegexCapture(text, pattern, captureIndex = 1) {
  const matches = [...text.matchAll(pattern)];
  if (!matches.length) {
    return "";
  }

  const match = matches[matches.length - 1];
  return String(match[captureIndex] || match[0] || "")
    .replace(/\s+/g, " ")
    .replace(/\s*[|·-]+\s*$/, "")
    .trim();
}

function normalizeExtractedLocation(value) {
  const cleaned = String(value || "")
    .replace(/^[^A-Za-z0-9]+/, "")
    .replace(/\s+/g, " ")
    .replace(/\s*[|;.:-]+\s*$/, "")
    .trim();

  if (!cleaned) {
    return "";
  }

  const cityStateMatch = getLastRegexCapture(cleaned, CITY_STATE_PATTERN);
  if (cityStateMatch) {
    return cityStateMatch;
  }

  const upperAbbreviationMatch = cleaned.match(
    new RegExp(`\\b([A-Z][A-Za-z'\\-]+(?: [A-Z][A-Za-z'\\-]+)*),\\s*(${STATE_ABBREVIATION_PATTERN})\\b`)
  );
  if (upperAbbreviationMatch) {
    const [, city, stateAbbrev] = upperAbbreviationMatch;
    const fullStateName = STATE_NAME_BY_ABBREV.get(stateAbbrev.toUpperCase());
    return fullStateName ? `${city}, ${fullStateName}` : `${city}, ${stateAbbrev}`;
  }

  return cleaned;
}

function detectMentionedStates(tokens, sourceText) {
  const normalized = normalizeText(sourceText);
  const mentionedStates = [];

  for (const token of tokens) {
    const fullStateName = STATE_BY_ABBREV.get(token);
    if (fullStateName) {
      mentionedStates.push([token, fullStateName]);
    }
  }

  for (const [abbrev, fullName] of US_STATES) {
    const pattern = new RegExp(`(^|[\\s,])${fullName}([\\s,]|$)`, "i");
    if (pattern.test(normalized)) {
      mentionedStates.push([abbrev, fullName]);
    }
  }

  return unique(mentionedStates.map(([abbrev, fullName]) => `${abbrev}|${fullName}`)).map((entry) => {
    const [abbrev, fullName] = entry.split("|");
    return { abbrev, fullName };
  });
}

export function buildLocationTokens(values) {
  const flattened = Array.isArray(values) ? values : [values];
  const expanded = new Set();

  for (const value of flattened) {
    const baseTokens = tokenize(value);
    const mentionedStates = detectMentionedStates(baseTokens, value);
    const stateWordTokens = new Set(mentionedStates.flatMap((state) => state.fullName.split(" ")));

    for (const token of baseTokens) {
      if (!stateWordTokens.has(token)) {
        expanded.add(token);
      }
    }

    for (const state of mentionedStates) {
      expanded.add(`state:${state.abbrev}`);
      expanded.add(state.abbrev);
      expanded.add(state.fullName);
    }
  }

  return [...expanded];
}

export function extractPublicLocation(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }

  const patterns = [
    {
      pattern: /\bLives in\s+([^;|.]+)(?=\s*[;|.]|$)/gi,
      captureIndex: 1
    },
    {
      pattern: /\bCurrent city[:\s]+([^;|.]+)(?=\s*[;|.]|$)/gi,
      captureIndex: 1
    },
    {
      pattern: /\bFrom\s+([^;|.]+)(?=\s*[;|.]|$)/gi,
      captureIndex: 1
    },
    {
      pattern: /Location:\s*([^|.]+?)(?=(?:\s+[A-Z][a-z]+:)|\s+\d+\s+connections|\s+\d+\s+followers|$)/gi,
      captureIndex: 1
    },
    {
      pattern: CITY_STATE_PATTERN,
      captureIndex: 1
    },
    {
      pattern: /\b([A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+)*,\s*(?:United States|USA))\b/g,
      captureIndex: 1
    },
    {
      pattern: /\b([A-Z][A-Za-z'-]+(?: [A-Z][A-Za-z'-]+)* Metropolitan Area)\b/g,
      captureIndex: 1
    }
  ];

  for (const { pattern, captureIndex } of patterns) {
    const match = getLastRegexCapture(text, pattern, captureIndex);
    if (match) {
      return normalizeExtractedLocation(match);
    }
  }

  return "";
}
