import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const manifest = JSON.parse(read("evals/plugin-behavior.json"));
const skillNames = [
  "acli",
  "jira-context",
  "jira-decompose",
  "jira-progress",
  "jira-work",
  "jira-workflow",
];

test("specific skills replace the generic router and custom agent", () => {
  assert.equal(existsSync(resolve(repositoryRoot, "skills/jira/SKILL.md")), false);
  assert.equal(existsSync(resolve(repositoryRoot, "agents/jira-agent.md")), false);
  for (const name of skillNames) {
    assert.match(read(`skills/${name}/SKILL.md`), new RegExp(`^---\\nname: ${name}$`, "m"));
  }
});

test("all current workflows execute directly without a mode or fork interface", () => {
  const sources = skillNames.map((name) => read(`skills/${name}/SKILL.md`)).join("\n");
  assert.doesNotMatch(sources, /context:\s*fork|mode selection|direct mode|subagent mode/i);
});

test("routing evals cover every direct skill outcome", () => {
  const decisions = new Set(
    manifest
      .filter((evaluation) => evaluation.category === "skill-routing")
      .map((evaluation) => evaluation.expected.decision),
  );
  assert.deepEqual(
    decisions,
    new Set([
      "route:acli",
      "route:jira-context",
      "route:jira-decompose",
      "route:jira-progress",
      "route:jira-work",
      "route:jira-workflow",
    ]),
  );
});

test("README exposes every manual skill invocation", () => {
  const readme = read("README.md");
  for (const name of skillNames) assert.match(readme, new RegExp(`/jira:${name}`));
});
