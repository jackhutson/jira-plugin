#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const manifestPath = resolve(repositoryRoot, ".claude-plugin/plugin.json");
const marketplacePath = resolve(
  repositoryRoot,
  ".claude-plugin/marketplace.json",
);

const manifest = readJson(manifestPath);
const marketplace = readJson(marketplacePath);
const marketplacePlugin = marketplace.plugins?.find(
  (plugin) => plugin.name === manifest.name,
);

if (!marketplacePlugin) {
  fail(`Marketplace has no entry for plugin ${JSON.stringify(manifest.name)}`);
}

if (typeof manifest.version !== "string" || manifest.version.length === 0) {
  fail("Plugin manifest must declare a version");
}

if (typeof marketplacePlugin.version !== "string") {
  fail("Marketplace plugin entry must declare a version");
}

if (manifest.version !== marketplacePlugin.version) {
  fail(
    `Version mismatch: plugin.json has ${manifest.version}, ` +
      `marketplace.json has ${marketplacePlugin.version}`,
  );
}

const validation = spawnSync(
  "claude",
  ["plugin", "validate", "--strict", repositoryRoot],
  { stdio: "inherit" },
);

if (validation.error) {
  fail(`Could not run Claude Code validation: ${validation.error.message}`);
}

if (validation.status !== 0) {
  process.exit(validation.status ?? 1);
}

console.log(
  `Release check passed: manifest and marketplace agree on ${manifest.version}`,
);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Could not read ${path}: ${error.message}`);
  }
}

function fail(message) {
  console.error(`Release check failed: ${message}`);
  process.exit(1);
}
