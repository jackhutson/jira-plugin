import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(resolve(repositoryRoot, path), "utf8");
const policy = read("docs/mutation-safety.md");
const acli = [
  "skills/acli/SKILL.md",
  "skills/acli/references/mutations.md",
  "skills/acli/references/custom-fields.md",
  "skills/acli/references/planning-resources.md",
].map(read).join("\n");
const decompose = read("skills/jira-decompose/SKILL.md");
const progress = read("skills/jira-progress/SKILL.md");
const context = read("skills/jira-context/SKILL.md");
const evals = JSON.parse(read("evals/mutation-safety.json"));

const mutatingWorkflows = [
  "skills/acli/SKILL.md",
  "skills/jira-decompose/SKILL.md",
  "skills/jira-progress/SKILL.md",
  "skills/jira-work/SKILL.md",
  "skills/jira-workflow/SKILL.md",
];

for (const item of evals) {
  test(`model eval ${item.id} => ${item.expected.decision}`, () => {
    assert.ok(item.prompt);
    assert.ok(item.expected.targets !== undefined);
    if (item.expected.requiresConfirmation) {
      assert.match(item.expected.decision, /preview.*confirm/);
    }
  });
}

test("one shared policy defines authorization, exact previews, and partial outcomes", () => {
  assert.match(policy, /Explicit, single, targeted mutation/);
  assert.match(policy, /bulk, destructive, or hard-to-reverse/);
  assert.match(policy, /Proceed with exactly these targets\?/);
  assert.match(policy, /Never broaden explicit keys into a JQL or filter mutation/);
  assert.match(policy, /`--yes` only suppresses an ACLI prompt after authorization/);
  assert.match(policy, /stop before any new mutation phase/);
  assert.match(policy, /succeeded, failed, unknown, or not\s+attempted/);
  assert.doesNotMatch(acli, /Always use `--yes`/);
});

test("every mutating workflow references the shared policy", () => {
  for (const path of mutatingWorkflows) {
    assert.match(
      read(path),
      /\$\{CLAUDE_PLUGIN_ROOT\}\/docs\/mutation-safety\.md/,
      `${path} does not reference the shared policy`,
    );
  }
});

test("only the read-only context skill pre-approves ACLI tools", () => {
  assert.match(context, /allowed-tools:/);
  const contextFrontmatter = frontmatter(context);
  assert.doesNotMatch(
    contextFrontmatter,
    /\b(create|edit|delete|transition|assign|archive|update)\b/,
  );

  for (const path of mutatingWorkflows.filter((path) => path.startsWith("skills/"))) {
    assert.doesNotMatch(
      frontmatter(read(path)),
      /allowed-tools:/,
      `${path} must not pre-approve mutation tools`,
    );
  }
});

test("bulk selector examples resolve reads and mutate frozen explicit keys", () => {
  for (const command of shellCommands(acli)) {
    if (/^acli jira workitem (edit|transition|assign|comment create)/.test(command)) {
      assert.doesNotMatch(command, /--(jql|filter)\b/);
    }
  }
  assert.match(acli, /Resolve a JQL request read-only/);
  assert.match(acli, /Project deletion always requires a preview/);
  assert.match(acli, /Archive and delete operations always use the shared preview gate/);
  assert.match(acli, /Before multi-ticket creation/);
});

test("batch and sequential workflows stop safely on partial outcomes", () => {
  assertOrdered(progress, [
    "Preview the exact batch and wait for confirmation",
    "Transition only the confirmed frozen keys",
    "Reconcile every requested key",
    "Continue only if every eligible transition succeeded",
  ]);
  assert.match(progress, /stop before comments and report the partial result/);
  assert.match(decompose, /Stop immediately if a create fails/);
  assert.match(decompose, /created, failed, and not-attempted tickets/);
});

test("model eval fixtures cover every required safety decision", () => {
  const categories = new Set(evals.map((item) => item.category));
  for (const category of [
    "read",
    "explicit-single",
    "ambiguous",
    "bulk",
    "destructive",
    "selector",
    "multi-create",
    "implicit-follow-on",
  ]) {
    assert.ok(categories.has(category), `missing ${category} eval`);
  }

  for (const item of evals) {
    assert.ok(item.id && item.prompt && item.expected?.decision);
    if (item.expected.requiresConfirmation) {
      assert.ok(item.expected.targets, `${item.id} needs exact preview targets`);
    }
  }
});

function frontmatter(source) {
  return source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
}

function shellCommands(source) {
  const commands = [];
  let pending = "";
  for (const rawLine of source.split("\n")) {
    const line = rawLine.trim();
    if (pending || line.startsWith("acli ")) {
      pending += `${pending ? " " : ""}${line.replace(/\\$/, "").trim()}`;
      if (!line.endsWith("\\")) {
        commands.push(pending);
        pending = "";
      }
    }
  }
  return commands;
}

function assertOrdered(source, markers) {
  let previousIndex = -1;
  for (const marker of markers) {
    const index = source.indexOf(marker);
    assert.ok(index > previousIndex, `${JSON.stringify(marker)} is out of order`);
    previousIndex = index;
  }
}
