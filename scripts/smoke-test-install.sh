#!/usr/bin/env bash

set -euo pipefail

repository_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
test_root=$(mktemp -d "${TMPDIR:-/tmp}/jira-plugin-install-smoke.XXXXXX")
marketplace_root="$test_root/jira-plugin"
config_root="$test_root/config"
cache_root="$test_root/cache"

# Invoked indirectly by trap.
# shellcheck disable=SC2329
cleanup() {
    rm -rf -- "$test_root"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$marketplace_root" "$config_root" "$cache_root"
cp -R \
    "$repository_root/.claude-plugin" \
    "$repository_root/config" \
    "$repository_root/docs" \
    "$repository_root/hooks" \
    "$repository_root/schemas" \
    "$repository_root/scripts" \
    "$repository_root/skills" \
    "$marketplace_root/"
cp \
    "$repository_root/CHANGELOG.md" \
    "$repository_root/CONTEXT.md" \
    "$repository_root/LICENSE" \
    "$repository_root/README.md" \
    "$marketplace_root/"

run_claude() {
    CLAUDE_CONFIG_DIR="$config_root" \
    CLAUDE_CODE_PLUGIN_CACHE_DIR="$cache_root" \
    NO_COLOR=1 \
        claude "$@"
}

run_claude plugin marketplace add "$marketplace_root" >/dev/null
run_claude plugin install jira@jira-marketplace >/dev/null
plugin_list=$(run_claude plugin list --json)
expected_version=$(node -p \
    "JSON.parse(require('node:fs').readFileSync(process.argv[1], 'utf8')).version" \
    "$repository_root/.claude-plugin/plugin.json")

# The JavaScript template literal is evaluated by Node, not the shell.
# shellcheck disable=SC2016
PLUGIN_LIST="$plugin_list" \
EXPECTED_VERSION="$expected_version" \
CACHE_ROOT="$cache_root" \
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const plugins = JSON.parse(process.env.PLUGIN_LIST);
  const installed = plugins.find((plugin) => plugin.id === "jira@jira-marketplace");
  if (!installed) throw new Error("installed plugin was not listed");
  if (installed.version !== process.env.EXPECTED_VERSION) {
    throw new Error(`installed ${installed.version}, expected ${process.env.EXPECTED_VERSION}`);
  }
  const installedRoot = path.resolve(installed.installPath);
  const cacheRoot = `${path.resolve(process.env.CACHE_ROOT)}${path.sep}`;
  if (!installedRoot.startsWith(cacheRoot)) throw new Error("installation escaped isolated cache");
  for (const candidate of [
    "hooks/session-start",
    "scripts/jira-plugin.mjs",
    "skills/acli/SKILL.md",
    "skills/jira-context/SKILL.md",
    "skills/jira-decompose/SKILL.md",
    "skills/jira-progress/SKILL.md",
    "skills/jira-work/SKILL.md",
    "skills/jira-workflow/SKILL.md",
  ]) fs.accessSync(path.resolve(installedRoot, candidate));
'

printf 'Clean install smoke test passed: jira@jira-marketplace %s\n' "$expected_version"
