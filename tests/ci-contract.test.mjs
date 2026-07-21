import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const ci = read(".github/workflows/ci.yml");
const modelEvals = read(".github/workflows/model-evals.yml");
const acliCompatibility = read(".github/workflows/acli-compatibility.yml");
const acliInstaller = read("scripts/install-acli-test-binary.sh");
const localRunner = read("scripts/validate.sh");

test("PR CI has least privilege and separate actionable validation jobs", () => {
  assert.match(ci, /pull_request:/);
  assert.match(ci, /permissions:\n  contents: read/);
  for (const job of [
    "plugin-validation",
    "shell-and-hooks",
    "behavior",
    "acli-command-contract",
  ]) {
    assert.match(ci, new RegExp(`  ${job}:`));
  }
});

test("CI covers strict validation, JSON, shell, behavior, and live ACLI help", () => {
  for (const group of ["plugin", "shell", "behavior", "contract"]) {
    assert.match(ci, new RegExp(`bash scripts/validate\\.sh ${group}`));
  }
  assert.match(localRunner, /claude plugin validate --strict \./);
  assert.match(localRunner, /node scripts\/validate-json\.mjs/);
  assert.match(localRunner, /local shell_files=\(hooks\/session-start\)/);
  assert.match(localRunner, /bash -n "\$\{shell_files\[@\]\}"/);
  assert.match(localRunner, /shellcheck "\$\{shell_files\[@\]\}"/);
  assert.match(localRunner, /tests\/session-start-hook\.test\.sh/);
  assert.match(localRunner, /tests\/acli-command-contract\.test\.mjs/);
  assert.match(ci, /target: minimum/);
  assert.match(ci, /expected-version: 1\.3\.15-stable/);
  assert.match(ci, /target: latest/);
  assert.match(ci, /scripts\/install-acli-test-binary\.sh/);
  assert.match(acliInstaller, /linux\/1\.3\.15-stable\//);
  assert.match(acliInstaller, /809f1bba338df1a4a4fa2003e2f8cd3789e1e65cbba5c7b370d629b44810b9bf/);
  assert.match(acliInstaller, /linux\/latest\//);
});

test("monthly ACLI compatibility drift creates an actionable maintenance item", () => {
  assert.doesNotMatch(acliCompatibility, /pull_request:/);
  assert.match(acliCompatibility, /schedule:/);
  assert.match(acliCompatibility, /bash scripts\/validate\.sh all/);
  assert.match(acliCompatibility, /permissions:\n  contents: read\n  issues: write/);
  assert.match(acliCompatibility, /gh issue (list|create)/);
  assert.match(acliCompatibility, /update the supported range, command examples, fixtures, and release notes/);
  assert.match(acliCompatibility, /Fail the scheduled check after reporting/);
});

test("credentialed model evals are separate from ordinary PR CI", () => {
  assert.doesNotMatch(modelEvals, /pull_request:/);
  assert.match(modelEvals, /workflow_dispatch:/);
  assert.match(modelEvals, /schedule:/);
  assert.match(modelEvals, /ANTHROPIC_API_KEY: \$\{\{ secrets\.ANTHROPIC_API_KEY \}\}/);
  assert.match(modelEvals, /if: env\.ANTHROPIC_API_KEY != ''/);
  assert.match(modelEvals, /node scripts\/run-model-evals\.mjs/);
});
