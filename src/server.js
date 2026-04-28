import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const webRoot = path.join(projectRoot, "web");
const port = Number(process.env.PORT || 4173);

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

async function serveStatic(response, requestPath) {
  const normalizedPath =
    requestPath === "/"
      ? "/index.html"
      : requestPath.endsWith("/")
        ? `${requestPath}index.html`
        : requestPath;
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

  response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("File not found");
}

const server = createServer(async (request, response) => {
  try {
    if (!request.url) {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Missing request URL");
      return;
    }

    if (request.method !== "GET") {
      response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Method not allowed");
      return;
    }

    const url = new URL(request.url, `http://${request.headers.host || `localhost:${port}`}`);
    await serveStatic(response, url.pathname);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(error instanceof Error ? error.message : "Internal server error");
  }
});

server.listen(port, () => {
  console.log(`Missing Person Support Kit running at http://localhost:${port}`);
});
