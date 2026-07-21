import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  ACLI_SUPPORTED_RANGE,
  classifyAcliVersion,
} from "../scripts/acli-version.mjs";

const acliBinary = process.env.ACLI_BIN || "acli";
const expectedVersion = process.env.ACLI_EXPECTED_VERSION;

const contracts = [
  {
    name: "ticket read",
    command: ["jira", "workitem", "view"],
    required: ["--fields", "--json"],
  },
  {
    name: "ticket search",
    command: ["jira", "workitem", "search"],
    required: ["--jql", "--fields", "--limit", "--json"],
  },
  {
    name: "work item create",
    command: ["jira", "workitem", "create"],
    required: ["--summary", "--project", "--type", "--from-json", "--generate-json", "--json"],
    forbidden: ["--yes"],
  },
  {
    name: "work item edit",
    command: ["jira", "workitem", "edit"],
    required: ["--key", "--summary", "--labels", "--yes", "--json"],
  },
  {
    name: "work item delete",
    command: ["jira", "workitem", "delete"],
    required: ["--key", "--yes", "--json"],
  },
  {
    name: "single and batch transition",
    command: ["jira", "workitem", "transition"],
    required: ["--key", "--status", "--yes", "--ignore-errors", "--json"],
  },
  {
    name: "assignment",
    command: ["jira", "workitem", "assign"],
    required: ["--key", "--assignee", "--yes", "--json"],
    requiredText: ["Use '@me' to self-assign"],
  },
  {
    name: "comment create",
    command: ["jira", "workitem", "comment", "create"],
    required: ["--key", "--body", "--json"],
  },
  {
    name: "recent comments",
    command: ["jira", "workitem", "comment", "list"],
    required: ["--key", "--limit", "--order", "--json"],
  },
  {
    name: "comment update",
    command: ["jira", "workitem", "comment", "update"],
    required: ["--key", "--id", "--body"],
    forbidden: ["--comment-id"],
  },
  {
    name: "comment delete",
    command: ["jira", "workitem", "comment", "delete"],
    required: ["--key", "--id"],
    forbidden: ["--comment-id"],
  },
  {
    name: "sprint work items",
    command: ["jira", "sprint", "list-workitems"],
    required: ["--sprint", "--board", "--json"],
    forbidden: ["--id"],
  },
  {
    name: "favourite filter",
    command: ["jira", "filter", "add-favourite"],
    required: ["--filter-id"],
    forbidden: ["--id", "--filterId"],
  },
  {
    name: "project update",
    command: ["jira", "project", "update"],
    required: ["--project-key", "--key", "--name", "--from-json"],
  },
  {
    name: "project list",
    command: ["jira", "project", "list"],
    required: ["--json"],
  },
  {
    name: "project view",
    command: ["jira", "project", "view"],
    required: ["--key", "--json"],
  },
  {
    name: "board search",
    command: ["jira", "board", "search"],
    required: ["--name", "--json"],
  },
  {
    name: "board details",
    command: ["jira", "board", "get"],
    required: ["--id", "--json"],
  },
  {
    name: "board sprints",
    command: ["jira", "board", "list-sprints"],
    required: ["--id", "--json"],
  },
  {
    name: "filter list",
    command: ["jira", "filter", "list"],
    required: ["--json"],
  },
  {
    name: "filter details",
    command: ["jira", "filter", "get"],
    required: ["--id", "--json"],
  },
];

test("ACLI executable matches the requested version", () => {
  const version = run(["--version"]).trim();
  const compatibility = classifyAcliVersion(version);
  assert.equal(
    compatibility.supported,
    true,
    `${version} is outside supported range ${ACLI_SUPPORTED_RANGE}`,
  );
  if (expectedVersion) {
    assert.equal(version, `acli version ${expectedVersion}`);
  }
});

for (const contract of contracts) {
  test(`${contract.name} flags match ACLI help`, () => {
    const help = run([...contract.command, "--help"]);
    const flags = new Set(help.match(/--[A-Za-z][A-Za-z0-9-]*/g) ?? []);

    for (const flag of contract.required) {
      assert.ok(
        flags.has(flag),
        `${contract.command.join(" ")} is missing required flag ${flag}`,
      );
    }
    for (const flag of contract.forbidden ?? []) {
      assert.ok(
        !flags.has(flag),
        `${contract.command.join(" ")} unexpectedly exposes ${flag}`,
      );
    }
    for (const text of contract.requiredText ?? []) {
      assert.ok(
        help.includes(text),
        `${contract.command.join(" ")} help is missing ${JSON.stringify(text)}`,
      );
    }
  });
}

function run(arguments_) {
  const result = spawnSync(acliBinary, arguments_, { encoding: "utf8" });

  if (result.error && result.status === null) {
    throw new Error(
      `Could not run ${acliBinary}. Install ACLI or set ACLI_BIN to a supported binary: ${result.error.message}`,
    );
  }
  assert.equal(
    result.status,
    0,
    `${acliBinary} ${arguments_.join(" ")} failed:\n${result.stderr}`,
  );
  return result.stdout;
}
