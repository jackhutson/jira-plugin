import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const contextSkill = read("skills/jira-context/SKILL.md");
const progressSkill = read("skills/jira-progress/SKILL.md");
const workSkill = read("skills/jira-work/SKILL.md");
const acliSkill = [
  "skills/acli/SKILL.md",
  "skills/acli/references/mutations.md",
  "skills/acli/references/custom-fields.md",
  "skills/acli/references/planning-resources.md",
].map(read).join("\n");

test("read fixture requests five newest comments without promising unfetched data", () => {
  assert.match(
    contextSkill,
    /comment list --key "KEY-123" --limit 5 --order -created --json/,
  );
  assert.doesNotMatch(contextSkill, /linked context|Sprint: Sprint/);
});

test("single-transition fixture preflights before mutation and gates follow-ups", () => {
  assertOrdered(progressSkill, [
    "Fetch current status before mutation",
    "Validate the transition",
    "Check required fields before mutation",
    "Transition status and request parseable output",
    "Add a comment after confirmed transition success",
    "Self-assign only after confirmed transition success",
  ]);
  assert.match(progressSkill, /transition .* --yes --json/);
  assert.match(progressSkill, /On a nonzero or malformed result, re-fetch status once/);
});

test("mixed-batch fixture reports partial results and stops follow-ons", () => {
  assert.match(progressSkill, /--yes --ignore-errors --json/);
  assert.match(progressSkill, /Reconcile every requested key/);
  assert.match(progressSkill, /Continue only if every eligible transition succeeded/);
  assert.match(progressSkill, /stop before comments and report the partial result/);
  assert.match(progressSkill, /Partial success is committed state/);
  assert.match(progressSkill, /transition failed; remains IN REVIEW \| No comment/);
});

test("assignment fixture uses self or a resolved explicit user", () => {
  assert.match(workSkill, /--assignee "@me" --yes --json/);
  assert.match(
    progressSkill,
    /email or account ID resolved from the\s+user's input/,
  );
  assert.doesNotMatch(
    `${progressSkill}\n${workSkill}`,
    /--assignee "user@(email|example)\.com"/,
  );
});

test("comment, sprint, filter, and project-update fixtures use supported flags", () => {
  assert.match(acliSkill, /comment update[\s\S]*?--id "10001"/);
  assert.match(acliSkill, /comment delete[\s\S]*?--id "10001"/);
  assert.match(
    acliSkill,
    /sprint list-workitems --sprint 456 --board 123 --json/,
  );
  assert.match(acliSkill, /filter add-favourite --filter-id 10001/);
  assert.match(
    acliSkill,
    /project update[\s\S]*?--project-key "TEAM" --name "New Team Name"/,
  );
  assert.match(acliSkill, /board get --id 123 --json/);
  assert.doesNotMatch(acliSkill, /acli jira sprint list-workitems --id/);
});

test("create and authentication fixtures avoid unsupported or interactive behavior", () => {
  assert.match(acliSkill, /never start interactive login/i);
  assert.doesNotMatch(acliSkill, /Always authenticate first/);
});

function assertOrdered(source, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${JSON.stringify(marker)} is out of order`);
    previousIndex = index;
  }
}
