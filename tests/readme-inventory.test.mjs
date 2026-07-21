import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  compareInventory,
  parsePluginDetails,
  parseReadmeInventory,
} from "../scripts/check-readme-inventory.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");

test("README inventory parser matches Claude details format", () => {
  const actual = parsePluginDetails(`
Component inventory
  Skills (2)  second, first
  Agents (0)
  Hooks (1)  SessionStart
Projected token cost
  Always-on:   ~123 tok
`);
  const documented = parseReadmeInventory(
    "<!-- plugin-details: skills=first,second; agents=0; hooks=1; always-on=123; claude=2.1.216; measured=2026-07-20 -->",
  );
  assert.deepEqual(compareInventory(documented, actual), []);
});

test("README rejects removed configuration and obsolete token comparisons", () => {
  const readme = read("README.md");
  assert.doesNotMatch(readme, /\.claude\/settings\.local\.json/);
  assert.doesNotMatch(readme, /24,500|99\.7%|Idle cost is ~80/);
  assert.match(readme, /claude --plugin-dir \. plugin details jira/);
  assert.match(readme, /Measured on 2026-07-20 with Claude Code 2\.1\.216/);
});

test("marketplace and plugin metadata are useful and current", () => {
  const plugin = JSON.parse(read(".claude-plugin/plugin.json"));
  const marketplace = JSON.parse(read(".claude-plugin/marketplace.json"));
  const entry = marketplace.plugins.find((candidate) => candidate.name === "jira");
  assert.equal(
    marketplace.$schema,
    "https://json.schemastore.org/claude-code-marketplace.json",
  );
  for (const candidate of [plugin, entry]) {
    assert.match(candidate.description, /Jira Cloud/i);
    assert.match(candidate.homepage, /^https:\/\/github\.com\//);
    assert.match(candidate.repository, /^https:\/\/github\.com\//);
    assert.equal(candidate.license, "MIT");
    assert.ok(candidate.keywords.includes("acli"));
  }
});

test("editor schema associations cover mutable JSON fixtures", () => {
  const settings = JSON.parse(read(".vscode/settings.json"));
  const associations = new Map(
    settings["json.schemas"].map((entry) => [entry.fileMatch[0], entry.url]),
  );
  assert.deepEqual(
    associations,
    new Map([
      ["/config/workflows.json.example", "./schemas/workflows.schema.json"],
      ["/evals/plugin-behavior.json", "./schemas/plugin-behavior.schema.json"],
      ["/evals/mutation-safety.json", "./schemas/mutation-safety.schema.json"],
    ]),
  );
  for (const schema of associations.values()) {
    const candidate = JSON.parse(read(schema.replace("./", "")));
    assert.equal(candidate.$schema, "https://json-schema.org/draft/2020-12/schema");
  }
});
