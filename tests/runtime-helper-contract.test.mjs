import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const operationalDocuments = [
  "skills/acli/SKILL.md",
  "skills/jira-context/SKILL.md",
  "skills/jira-decompose/SKILL.md",
  "skills/jira-progress/SKILL.md",
  "skills/jira-work/SKILL.md",
  "skills/jira-workflow/SKILL.md",
].map(read).join("\n");
const helper = read("scripts/jira-plugin.mjs");
const storage = read("scripts/workflow-config.mjs");

test("operational guidance delegates shared runtime behavior to one helper", () => {
  assert.doesNotMatch(
    operationalDocuments,
    /workflow-config\.mjs|acli --version|acli jira auth status|CLAUDE_PLUGIN_DATA|workflows\.json/i,
  );
  assert.match(operationalDocuments, /jira-plugin\.mjs" doctor --json/);
  assert.match(operationalDocuments, /jira-plugin\.mjs" resolve-key/);
  assert.match(operationalDocuments, /jira-plugin\.mjs" config get/);
  assert.match(operationalDocuments, /jira-plugin\.mjs" config set/);
});

test("ticket-oriented skills normalize references only through the helper", () => {
  for (const path of [
    "skills/jira-context/SKILL.md",
    "skills/jira-progress/SKILL.md",
    "skills/jira-work/SKILL.md",
  ]) {
    const source = read(path);
    assert.match(source, /jira-plugin\.mjs" resolve-key/);
    assert.match(source, /never reproduce its inference/i);
  }
});

test("public helper owns four stable command surfaces", () => {
  for (const command of ["doctor", "resolve-key", "config get", "config set"]) {
    assert.match(helper, new RegExp(`\\b${command.replace(" ", "[ \\\"]")}\\b`));
  }
  assert.match(helper, /schema_version: SCHEMA_VERSION/);
  assert.match(helper, /exitCode:/);
});

test("runtime helper is independent of ticket mutation policy and commands", () => {
  const implementation = `${helper}\n${storage}`;
  assert.doesNotMatch(implementation, /mutation-safety|workitem\s+(?:create|edit|delete|transition|assign)|comment\s+(?:create|update|delete)/i);
  assert.deepEqual(
    [...helper.matchAll(/\["jira",\s*"([^"]+)",\s*"([^"]+)"\]/g)].map(
      (match) => `${match[1]} ${match[2]}`,
    ),
    ["auth status"],
  );
});

test("storage implementation has no second command-line interface", () => {
  assert.doesNotMatch(storage, /process\.argv|Usage:|set-default/);
});
