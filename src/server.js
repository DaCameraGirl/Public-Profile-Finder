import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "./lib/env.js";
import { rankCandidates, sanitizeQuery } from "./lib/scoring.js";
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
  ".json": "application/json; charset=utf-8"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload, null, 2));
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
  const filePath = path.join(webRoot, normalizedPath);
  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  const fileContents = await readFile(filePath);

  response.writeHead(200, { "Content-Type": contentType });
  response.end(fileContents);
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
      const query = sanitizeQuery(payload);
      const rawPhotoHints = Array.isArray(payload?.photoHints)
        ? payload.photoHints.filter(Boolean)
        : [payload?.photoHints].filter(Boolean);
      const hadOnlyInvalidPhotoHints =
        rawPhotoHints.length > 0 &&
        !query.photoHints.length &&
        !String(payload?.name || "").trim() &&
        !(payload?.handles || []).length &&
        !(payload?.bioKeywords || []).length &&
        !(payload?.locationHints || []).length;

      if (!query.name && !query.handles.length && !query.bioKeywords.length && !query.locationHints.length && !query.photoHints.length) {
        sendJson(response, 400, {
          error: "Enter at least one clue before searching.",
          detail: hadOnlyInvalidPhotoHints
            ? "Photo hints must be direct public image URLs ending in .jpg, .jpeg, .png, .webp, or .gif. Profile page links like LinkedIn do not work here."
            : "Add a name, handle, location hint, keyword, or public photo URL."
        });
        return;
      }

      const { source, candidates } = await loadSourceCandidates(query);
      const ranked = rankCandidates(query, candidates, {
        sourceMode: source.mode
      });

      sendJson(response, 200, {
        source,
        query,
        candidateCount: candidates.length,
        scoredCandidateCount: ranked.meta.scoredCandidateCount,
        hiddenCandidateCount: ranked.meta.hiddenCandidateCount,
        conflictingCandidateCount: ranked.meta.conflictingCandidateCount,
        resultCount: ranked.results.length,
        filter: ranked.meta,
        results: ranked.results
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
