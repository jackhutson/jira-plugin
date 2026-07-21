#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parsePluginDetails(source) {
  const skills = source.match(/Skills \((\d+)\)\s+([^\n]+)/);
  const agents = source.match(/Agents \((\d+)\)/);
  const hooks = source.match(/Hooks \((\d+)\)/);
  const alwaysOn = source.match(/Always-on:\s+~(\d+) tok/);
  if (!skills || !agents || !hooks || !alwaysOn) {
    throw new Error("Could not parse Claude plugin details output");
  }
  const names = skills[2].split(",").map((name) => name.trim()).sort();
  if (names.length !== Number(skills[1])) {
    throw new Error("Claude plugin details skill count does not match its inventory");
  }
  return {
    skills: names,
    agents: Number(agents[1]),
    hooks: Number(hooks[1]),
    alwaysOn: Number(alwaysOn[1]),
  };
}

export function parseReadmeInventory(source) {
  const marker = source.match(/<!-- plugin-details: ([^>]+) -->/);
  if (!marker) throw new Error("README is missing its plugin-details inventory marker");
  const fields = Object.fromEntries(
    marker[1].split(";").map((field) => {
      const [key, ...value] = field.trim().split("=");
      return [key, value.join("=")];
    }),
  );
  return {
    skills: fields.skills.split(",").sort(),
    agents: Number(fields.agents),
    hooks: Number(fields.hooks),
    alwaysOn: Number(fields["always-on"]),
    claude: fields.claude,
    measured: fields.measured,
  };
}

export function compareInventory(documented, actual) {
  const failures = [];
  for (const field of ["skills", "agents", "hooks", "alwaysOn"]) {
    if (JSON.stringify(documented[field]) !== JSON.stringify(actual[field])) {
      failures.push(
        `${field}: README ${JSON.stringify(documented[field])} != Claude ${JSON.stringify(actual[field])}`,
      );
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documented.measured)) {
    failures.push("README measurement date must be YYYY-MM-DD");
  }
  if (!/^\d+\.\d+\.\d+$/.test(documented.claude)) {
    failures.push("README Claude Code version must be semantic");
  }
  return failures;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const documented = parseReadmeInventory(
    readFileSync(resolve(repositoryRoot, "README.md"), "utf8"),
  );
  if (!process.argv.includes("--stdin")) {
    throw new Error(
      "Pipe `claude --plugin-dir . plugin details jira` into this command with --stdin",
    );
  }
  process.stdin.setEncoding("utf8");
  let details = "";
  for await (const chunk of process.stdin) details += chunk;
  const actual = parsePluginDetails(details);
  const failures = compareInventory(documented, actual);
  if (failures.length > 0) {
    console.error(`README plugin inventory is stale:\n- ${failures.join("\n- ")}`);
    process.exitCode = 1;
  } else {
    console.log(
      `README inventory matches Claude: ${actual.skills.length} skills, ` +
        `${actual.agents} agents, ${actual.hooks} hook, ~${actual.alwaysOn} tokens`,
    );
  }
}
