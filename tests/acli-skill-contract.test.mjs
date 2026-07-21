import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const main = read("skills/acli/SKILL.md");
const commandContract = read("tests/acli-command-contract.test.mjs");
const references = [
  "mutations.md",
  "custom-fields.md",
  "planning-resources.md",
];

test("main ACLI skill stays below the progressive-disclosure limit", () => {
  assert.ok(main.split("\n").length < 250);
  assert.ok(main.trim().split(/\s+/).length < 1_000);
  assert.doesNotMatch(main, /Common JQL patterns|Complete Workflows|Quick Reference|Troubleshooting/);
});

test("main skill routes optional detail by need and treats live help as authoritative", () => {
  assert.match(main, /Do not read every reference by default/);
  assert.match(main, /uncertain, unfamiliar, or version-sensitive command, inspect\s+help/);
  assert.match(main, />=1\.3\.15,<2\.0\.0/);
  for (const reference of references) {
    assert.match(main, new RegExp(`references/${reference.replace(".", "\\.")}`));
    assert.ok(read(`skills/acli/references/${reference}`).length > 0);
  }
});

test("retained version-sensitive gotchas are protected by executable contracts", () => {
  for (const flag of [
    "--from-json",
    "--generate-json",
    "--yes",
    "--id",
    "--sprint",
    "--board",
    "--filter-id",
    "--project-key",
  ]) {
    assert.match(commandContract, new RegExp(flag));
  }
  for (const command of ["board", "list-sprints", "filter", "project"]) {
    assert.match(commandContract, new RegExp(`"${command}"`));
  }
});
