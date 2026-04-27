import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const envFileKeys = new Set();

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

export function loadEnvFile(projectRoot, options = {}) {
  const { overrideExisting = false } = options;
  const envPath = path.join(projectRoot, ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const contents = readFileSync(envPath, "utf8");
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim());

    const canOverrideExisting = overrideExisting && (envFileKeys.has(key) || !(key in process.env));

    if (key && (canOverrideExisting || !(key in process.env))) {
      process.env[key] = value;
      envFileKeys.add(key);
    }
  }
}
