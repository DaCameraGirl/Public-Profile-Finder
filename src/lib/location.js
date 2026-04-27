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
    /Location:\s*([^|.]+?)(?=(?:\s+[A-Z][a-z]+:)|\s+\d+\s+connections|\s+\d+\s+followers|$)/i,
    /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?: [A-Z][a-z]+)*))(?:\b|$)/,
    /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)*\s*,\s*USA)(?:\b|$)/,
    /\b([A-Z][A-Za-z.'-]+(?: [A-Z][A-Za-z.'-]+)* Metropolitan Area)(?:\b|$)/
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].replace(/\s+/g, " ").trim();
    }

    if (match?.[0]) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }

  return "";
}
