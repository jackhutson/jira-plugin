#!/usr/bin/env node

import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const oldVersion = "1.0.0";
const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const manifestPath = resolve(repositoryRoot, ".claude-plugin/plugin.json");
const marketplacePath = resolve(
  repositoryRoot,
  ".claude-plugin/marketplace.json",
);
const temporaryRoot = mkdtempSync(join(tmpdir(), "jira-plugin-update-smoke-"));
const marketplaceRoot = join(temporaryRoot, "marketplace");
const configRoot = join(temporaryRoot, "config");
const pluginCacheRoot = join(temporaryRoot, "plugins");
let releaseVersion;
const isolatedEnvironment = {
  ...process.env,
  CLAUDE_CONFIG_DIR: configRoot,
  CLAUDE_CODE_PLUGIN_CACHE_DIR: pluginCacheRoot,
  NO_COLOR: "1",
};

try {
  releaseVersion = readJson(manifestPath).version;
  if (typeof releaseVersion !== "string" || releaseVersion === oldVersion) {
    fail(`Working-tree version must be newer than the ${oldVersion} fixture`);
  }

  run("git", ["clone", "--local", "--no-hardlinks", repositoryRoot, marketplaceRoot]);

  setFixtureVersion(marketplaceRoot, oldVersion);
  commitFixture(marketplaceRoot, `test: fixture plugin ${oldVersion}`);

  mkdirSync(configRoot, { recursive: true });
  mkdirSync(pluginCacheRoot, { recursive: true });

  runClaude(["plugin", "marketplace", "add", marketplaceRoot]);
  runClaude(["plugin", "install", "jira@jira-marketplace"]);

  const oldInstallation = installedPlugin();
  assertVersion(oldInstallation, oldVersion);
  assertIsolated(oldInstallation.installPath);

  cpSync(manifestPath, resolve(marketplaceRoot, ".claude-plugin/plugin.json"));
  cpSync(
    marketplacePath,
    resolve(marketplaceRoot, ".claude-plugin/marketplace.json"),
  );
  commitFixture(marketplaceRoot, `test: fixture plugin ${releaseVersion}`);
  runClaude(["plugin", "tag", "--dry-run", marketplaceRoot]);

  runClaude(["plugin", "marketplace", "update", "jira-marketplace"]);
  runClaude(["plugin", "update", "jira@jira-marketplace"]);

  const newInstallation = installedPlugin();
  assertVersion(newInstallation, releaseVersion);
  assertIsolated(newInstallation.installPath);

  const cachedManifest = readJson(
    resolve(newInstallation.installPath, ".claude-plugin/plugin.json"),
  );
  if (cachedManifest.version !== releaseVersion) {
    fail(
      `Updated cache contains ${cachedManifest.version}, expected ${releaseVersion}`,
    );
  }

  console.log(
    `Update smoke test passed: cached ${oldVersion} installation resolved to ${releaseVersion}`,
  );
} catch (error) {
  console.error(`Update smoke test failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}

function setFixtureVersion(root, version) {
  const fixtureManifestPath = resolve(root, ".claude-plugin/plugin.json");
  const fixtureMarketplacePath = resolve(root, ".claude-plugin/marketplace.json");
  const manifest = readJson(fixtureManifestPath);
  const marketplace = readJson(fixtureMarketplacePath);
  const marketplacePlugin = marketplace.plugins?.find(
    (plugin) => plugin.name === manifest.name,
  );

  if (!marketplacePlugin) {
    fail(`Fixture marketplace has no entry for ${manifest.name}`);
  }

  manifest.version = version;
  marketplacePlugin.version = version;
  writeFileSync(fixtureManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(fixtureMarketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
}

function commitFixture(root, message) {
  run("git", ["config", "user.name", "Release smoke test"], { cwd: root });
  run("git", ["config", "user.email", "release-smoke@example.invalid"], {
    cwd: root,
  });
  run("git", ["config", "commit.gpgSign", "false"], { cwd: root });
  run("git", ["add", ".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"], {
    cwd: root,
  });
  run("git", ["commit", "--allow-empty", "-m", message], { cwd: root });
}

function installedPlugin() {
  const listing = runClaude(["plugin", "list", "--json"], { capture: true });
  const plugins = JSON.parse(listing);
  const plugin = plugins.find((entry) => entry.id === "jira@jira-marketplace");

  if (!plugin) {
    fail("Claude Code did not list jira@jira-marketplace as installed");
  }

  return plugin;
}

function assertVersion(plugin, expectedVersion) {
  if (plugin.version !== expectedVersion) {
    fail(`Installed version is ${plugin.version}, expected ${expectedVersion}`);
  }
}

function assertIsolated(installPath) {
  const expectedPrefix = `${resolve(pluginCacheRoot)}${process.platform === "win32" ? "\\" : "/"}`;
  if (!resolve(installPath).startsWith(expectedPrefix)) {
    fail(`Plugin escaped the isolated cache: ${installPath}`);
  }
}

function runClaude(arguments_, options = {}) {
  return run("claude", arguments_, {
    cwd: temporaryRoot,
    env: isolatedEnvironment,
    ...options,
  });
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? temporaryRoot,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });

  if (result.error && result.status === null) {
    fail(`Could not run ${command}: ${result.error.message}`);
  }

  if (result.status !== 0) {
    if (options.capture && result.stderr) {
      process.stderr.write(result.stderr);
    }
    fail(`${command} ${arguments_.join(" ")} exited with ${result.status}`);
  }

  return options.capture ? result.stdout : "";
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    fail(`Could not read ${path}: ${error.message}`);
  }
}

function fail(message) {
  throw new Error(message);
}
