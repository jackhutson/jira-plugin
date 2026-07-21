import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("domain glossary defines the canonical Jira language", () => {
  const context = read("CONTEXT.md");
  for (const term of [
    "Jira site",
    "Project",
    "Workflow mapping",
    "Stage",
    "Work item",
    "Plugin data",
    "Mutation",
  ]) {
    assert.match(context, new RegExp(`\\*\\*${term}\\*\\*:`));
  }
  assert.doesNotMatch(context, /\.mjs|\.json|CLAUDE_PLUGIN_DATA|--[a-z]/);
});

test("required durable decisions have short ADRs", () => {
  const adrDirectory = resolve(repositoryRoot, "docs/adr");
  const decisions = readdirSync(adrDirectory)
    .filter((name) => /^\d{4}-.+\.md$/.test(name))
    .sort();
  assert.deepEqual(decisions, [
    "0001-acli-only-integration.md",
    "0002-site-scoped-workflow-storage.md",
    "0003-direct-skill-execution.md",
    "0004-exact-target-mutation-safety.md",
    "0005-versioned-plugin-releases.md",
  ]);
  for (const decision of decisions) {
    const source = read(`docs/adr/${decision}`);
    assert.match(source, /^# /);
    assert.ok(source.trim().split(/\s+/).length < 130, `${decision} is not concise`);
  }
});

test("superseded plans are isolated in a marked archive", () => {
  assert.equal(existsSync(resolve(repositoryRoot, "docs/plans")), false);
  const archivedPlans = readdirSync(resolve(repositoryRoot, "docs/archive/plans"))
    .filter((name) => name !== "README.md");
  assert.equal(archivedPlans.length, 8);
  assert.match(read("docs/archive/plans/README.md"), /non-normative/);
  assert.match(read("docs/archive/plans/README.md"), /Do not use these plans as implementation instructions/);
});

test("maintained docs point to current boundaries, not obsolete layouts", () => {
  const maintained = [
    "README.md",
    "docs/RELEASING.md",
    "docs/acli-command-contracts.md",
    "docs/adr/README.md",
    "docs/mutation-safety.md",
    "docs/runtime-helper.md",
  ].map(read).join("\n");
  assert.doesNotMatch(maintained, /jira-agent|skills\/jira\/SKILL|config\/workflows\.json(?!\.example)|direct mode|subagent mode/i);
  for (const link of [
    "CONTEXT.md",
    "docs/adr/README.md",
    "docs/RELEASING.md",
    "CHANGELOG.md",
  ]) {
    assert.match(read("README.md"), new RegExp(link.replaceAll(".", "\\.")));
  }
});
