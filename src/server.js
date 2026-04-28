import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./lib/env.js";
import { rankCandidates, sanitizeQuery } from "./lib/scoring.js";
import { mergeProfileCandidate, parseKnownProfileUrl } from "./lib/sources/profile-search-utils.js";
import { getSourceStatus, loadSourceCandidates } from "./lib/sources/search-source.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const webRoot = path.join(projectRoot, "web");

loadEnvFile(projectRoot, { overrideExisting: true });

const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
}

function toList(value) {
  if (Array.isArray(value)) {
    return value
      .flatMap((entry) => String(entry || "").split(/[\r\n,;]+/))
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  return String(value || "")
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function dedupeList(values) {
  return [...new Set(values.filter(Boolean))];
}

function prettifyUsername(value) {
  return String(value || "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildSeedCandidate(hint) {
  return {
    id: `${hint.platform.toLowerCase()}-${hint.username.toLowerCase()}`,
    platform: hint.platform,
    profileUrl: hint.profileUrl,
    displayName: prettifyUsername(hint.username) || hint.username,
    username: hint.username,
    bio: "Known public profile URL provided as a clue.",
    location: "",
    photoUrls: [],
    matchedPhotoFingerprints: [],
    publicText: `${hint.platform} ${hint.username} ${hint.profileUrl}`,
    sourceLabel: "Known profile URL",
    sourceQuery: "Known profile URL",
    sourceQueries: ["Known profile URL"]
  };
}

function mergeCandidates(candidates) {
  const merged = new Map();

  for (const candidate of candidates) {
    const existing = merged.get(candidate.profileUrl);
    if (existing) {
      merged.set(candidate.profileUrl, mergeProfileCandidate(existing, candidate));
    } else {
      merged.set(candidate.profileUrl, candidate);
    }
  }

  return [...merged.values()];
}

async function readRequestBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(response, requestPath) {
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const candidateRoots = [webRoot, projectRoot];

  for (const root of candidateRoots) {
    const filePath = path.resolve(root, `.${normalizedPath}`);
    if (!filePath.startsWith(root)) {
      continue;
    }

    try {
      const extension = path.extname(filePath).toLowerCase();
      const contentType = contentTypes[extension] || "application/octet-stream";
      const fileContents = await readFile(filePath);

      response.writeHead(200, { "Content-Type": contentType });
      response.end(fileContents);
      return;
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }
  }

  const notFoundError = new Error("File not found");
  notFoundError.code = "ENOENT";
  throw notFoundError;
}

const server = createServer(async (request, response) => {
  try {
    loadEnvFile(projectRoot, { overrideExisting: true });

    if (!request.url) {
      sendJson(response, 400, { error: "Missing request URL" });
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host}`);

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        source: getSourceStatus()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/search") {
      const rawBody = await readRequestBody(request);
      const payload = JSON.parse(rawBody || "{}");
      const rawHandles = toList(payload?.handles);
      const rawBioKeywords = toList(payload?.bioKeywords);
      const rawLocationHints = toList(payload?.locationHints);
      const rawPhotoInputs = toList(payload?.photoHints);
      const movedProfileUrls = rawPhotoInputs
        .map((photoHint) => parseKnownProfileUrl(photoHint)?.profileUrl || "")
        .filter(Boolean);
      const rawPhotoHints = rawPhotoInputs.filter((photoHint) => !parseKnownProfileUrl(photoHint));
      const rawProfileUrls = dedupeList([...toList(payload?.profileUrls), ...movedProfileUrls]);
      const recognizedProfileHints = rawProfileUrls
        .map((profileUrl) => parseKnownProfileUrl(profileUrl))
        .filter(Boolean);
      const query = sanitizeQuery({
        ...payload,
        handles: [...rawHandles, ...recognizedProfileHints.map((hint) => hint.username)],
        bioKeywords: rawBioKeywords,
        locationHints: rawLocationHints,
        profileUrls: rawProfileUrls,
        photoHints: rawPhotoHints
      });
      const hadOnlyInvalidPhotoHints =
        rawPhotoHints.length > 0 &&
        !query.photoHints.length &&
        !String(payload?.name || "").trim() &&
        rawHandles.length === 0 &&
        rawBioKeywords.length === 0 &&
        rawLocationHints.length === 0 &&
        rawProfileUrls.length === 0;
      const hadOnlyInvalidProfileUrls =
        rawProfileUrls.length > 0 &&
        recognizedProfileHints.length === 0 &&
        !String(payload?.name || "").trim() &&
        rawHandles.length === 0 &&
        rawBioKeywords.length === 0 &&
        rawLocationHints.length === 0 &&
        rawPhotoHints.length === 0;

      if (!query.name && !query.handles.length && !query.bioKeywords.length && !query.locationHints.length && !query.photoHints.length) {
        sendJson(response, 400, {
          error: "Enter at least one clue before searching.",
          detail: hadOnlyInvalidPhotoHints
            ? "Photo hints must be direct public image URLs ending in .jpg, .jpeg, .png, .webp, or .gif. Profile page links like LinkedIn do not work here."
            : hadOnlyInvalidProfileUrls
              ? "Known profile URLs must be supported public profile links such as LinkedIn, GitHub, Instagram, Facebook, TikTok, X, YouTube, Reddit, Bluesky, or Twitch."
              : "Add a name, handle, location hint, keyword, public profile URL, or public photo URL."
        });
        return;
      }

      const { source, candidates } = await loadSourceCandidates(query);
      const seededCandidates = recognizedProfileHints.map((hint) => buildSeedCandidate(hint));
      const combinedCandidates = mergeCandidates([...seededCandidates, ...candidates]);
      const ranked = rankCandidates(query, combinedCandidates, {
        sourceMode: source.mode
      });

      sendJson(response, 200, {
        source,
        query,
        recognizedProfileHints,
        candidateCount: combinedCandidates.length,
        scoredCandidateCount: ranked.meta.scoredCandidateCount,
        hiddenCandidateCount: ranked.meta.hiddenCandidateCount,
        conflictingCandidateCount: ranked.meta.conflictingCandidateCount,
        resultCount: ranked.results.length,
        filter: ranked.meta,
        results: ranked.results,
        hiddenResults: ranked.hiddenResults
      });
      return;
    }

    if (request.method === "GET") {
      await serveStatic(response, url.pathname);
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error?.code === "ENOENT") {
      sendJson(response, 404, { error: "File not found" });
      return;
    }

    if (error instanceof SyntaxError) {
      sendJson(response, 400, { error: "Request body must be valid JSON" });
      return;
    }

    sendJson(response, 500, {
      error: "Internal server error",
      detail: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(port, () => {
  console.log(`Public Profile Finder running at http://localhost:${port}`);
});
