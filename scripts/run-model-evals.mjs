#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(pluginRoot, "evals/plugin-behavior.json");

export function loadModelEvalManifest() {
  const cases = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateManifest(cases);
  return cases;
}

export function runModelEvals(cases, invoke) {
  const results = [];
  const failures = [];
  for (const evaluation of cases) {
    const result = invoke(evaluation);
    const caseFailures = score(evaluation, result);
    results.push({ evaluation, result, failures: caseFailures });
    failures.push(...caseFailures.map((failure) => `${evaluation.id}: ${failure}`));
  }
  return { results, failures };
}

function invokeClaude(evaluation) {
  const claudeBinary = process.env.CLAUDE_BIN || "claude";
  const schema = {
    type: "object",
    properties: {
      decision: { type: "string" },
      response: { type: "string" },
    },
    required: ["decision", "response"],
    additionalProperties: false,
  };
  const prompt = `[eval:${evaluation.id}]\nThis is a no-execution plugin behavior evaluation. Apply the installed Jira skills and shared policies. Do not contact Jira or change any state. Choose the decision label from route:jira-context, route:jira-progress, route:jira-work, route:jira-decompose, route:jira-workflow, route:acli, respond:concise, pause:confirm, stop:error, or report:partial, then return the user-facing response.\n\nUser request or fixture:\n${evaluation.prompt}`;
  const arguments_ = [
    "-p",
    "--bare",
    "--plugin-dir",
    pluginRoot,
    "--tools",
    "Skill,Read",
    "--disallowedTools",
    "Bash,Edit,Write,WebFetch,WebSearch",
    "--permission-mode",
    "dontAsk",
    "--model",
    process.env.CLAUDE_MODEL || "sonnet",
    "--max-budget-usd",
    process.env.MODEL_EVAL_MAX_BUDGET_USD || "0.20",
    "--no-session-persistence",
    "--output-format",
    "json",
    "--json-schema",
    JSON.stringify(schema),
    prompt,
  ];
  const command = spawnSync(claudeBinary, arguments_, {
    cwd: pluginRoot,
    encoding: "utf8",
    env: process.env,
    timeout: 120_000,
  });

  if (command.error || command.status !== 0) {
    const detail = command.error?.message || command.stderr.trim() || "no diagnostic";
    throw new Error(`${evaluation.id}: Claude invocation failed: ${detail}`);
  }

  const envelope = JSON.parse(command.stdout);
  const structured =
    envelope.structured_output ??
    envelope.structuredOutput ??
    (typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result);
  if (!structured || typeof structured.decision !== "string" || typeof structured.response !== "string") {
    throw new Error(`${evaluation.id}: Claude output did not contain decision and response`);
  }
  return structured;
}

export function score(evaluation, result) {
  const failures = [];
  const expected = evaluation.expected;
  const normalizedResponse = result.response.toLowerCase();
  if (result.decision !== expected.decision) {
    failures.push(`decision ${JSON.stringify(result.decision)} != ${JSON.stringify(expected.decision)}`);
  }
  for (const value of expected.contains ?? []) {
    if (!normalizedResponse.includes(value.toLowerCase())) {
      failures.push(`response missing ${JSON.stringify(value)}`);
    }
  }
  for (const value of expected.notContains ?? []) {
    if (normalizedResponse.includes(value.toLowerCase())) {
      failures.push(`response unexpectedly contains ${JSON.stringify(value)}`);
    }
  }
  if (expected.maxChars && result.response.length > expected.maxChars) {
    failures.push(`response length ${result.response.length} exceeds ${expected.maxChars}`);
  }
  return failures;
}

export function validateManifest(manifest) {
  const requiredCategories = new Set([
    "skill-routing",
    "concise-output",
    "mutation-confirmation",
    "anti-flailing",
    "partial-failure",
  ]);
  const ids = new Set();

  for (const evaluation of manifest) {
    if (!evaluation.id || ids.has(evaluation.id)) throw new Error("Model eval IDs must be present and unique");
    ids.add(evaluation.id);
    requiredCategories.delete(evaluation.category);
    if (!evaluation.prompt || !evaluation.expected?.decision) {
      throw new Error(`${evaluation.id}: prompt and expected.decision are required`);
    }
    if (!Number.isInteger(evaluation.expected.maxChars) || evaluation.expected.maxChars < 1) {
      throw new Error(`${evaluation.id}: expected.maxChars must be a positive integer`);
    }
  }
  if (requiredCategories.size > 0) {
    throw new Error(`Model eval categories missing: ${[...requiredCategories].join(", ")}`);
  }
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const cases = loadModelEvalManifest();
  if (process.argv.includes("--validate")) {
    console.log(`Model eval manifest passed (${cases.length} cases)`);
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is required for model evals. Use --validate for the offline manifest check.",
    );
    process.exitCode = 2;
  } else {
    const report = runModelEvals(cases, invokeClaude);
    for (const item of report.results) {
      if (item.failures.length === 0) {
        console.log(`PASS ${item.evaluation.id}: ${item.result.decision}`);
      } else {
        console.error(`FAIL ${item.evaluation.id}: ${item.failures.join("; ")}`);
      }
    }
    if (report.failures.length > 0) {
      console.error(`Model evals failed (${report.failures.length} assertions)`);
      process.exitCode = 1;
    } else {
      console.log(`Model evals passed (${cases.length} cases)`);
    }
  }
}
