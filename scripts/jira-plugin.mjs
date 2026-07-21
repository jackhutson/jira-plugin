#!/usr/bin/env node

import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  ACLI_SUPPORTED_RANGE,
  classifyAcliVersion,
} from "./acli-version.mjs";
import { openWorkflowConfig } from "./workflow-config.mjs";

const SCHEMA_VERSION = 1;
const EXIT = Object.freeze({
  SUCCESS: 0,
  USAGE: 2,
  ACLI_MISSING: 10,
  ACLI_UNSUPPORTED: 11,
  AUTH_REQUIRED: 12,
  ADMIN_AUTHORIZATION_REQUIRED: 13,
  NETWORK_ERROR: 14,
  TIMEOUT: 15,
  ACLI_ERROR: 16,
  SITE_REQUIRED: 20,
  PROJECT_REQUIRED: 21,
  AMBIGUOUS_PROJECT: 22,
  CONFIG_NOT_FOUND: 23,
  CONFIG_MALFORMED: 24,
  CONFIG_INVALID: 25,
  CONFIG_WRITE_FAILED: 26,
  CONFIG_LOCK_TIMEOUT: 27,
  INTERNAL_ERROR: 70,
});

export async function runJiraPlugin(arguments_, environment = process.env) {
  const [command, ...rest] = arguments_;
  try {
    switch (command) {
      case "doctor":
        return await doctor(rest, environment);
      case "resolve-key":
        return resolveKey(rest, environment);
      case "config":
        return config(rest, environment);
      default:
        return failure(
          "usage",
          "USAGE",
          "Usage: jira-plugin <doctor|resolve-key|config> [options]",
          EXIT.USAGE,
        );
    }
  } catch (error) {
    return mapUnexpectedError(command ?? "usage", error);
  }
}

async function doctor(arguments_, environment) {
  const options = parseOptions(arguments_, new Set(["json", "hook-json"]));
  if (options.positionals.length > 0) return usage("doctor", "doctor accepts no positional arguments");

  const timeoutSeconds = Number(environment.JIRA_PLUGIN_AUTH_TIMEOUT_SECONDS ?? "5");
  if (!Number.isInteger(timeoutSeconds) || timeoutSeconds < 1) {
    return failure(
      "doctor",
      "INVALID_TIMEOUT",
      "JIRA_PLUGIN_AUTH_TIMEOUT_SECONDS must be a positive integer.",
      EXIT.USAGE,
    );
  }

  const acliBinary = environment.ACLI_BIN || "acli";
  const deadline = Date.now() + timeoutSeconds * 1000;
  const versionResult = await runBounded(acliBinary, ["--version"], deadline, environment);
  if (versionResult.missing) {
    return failure(
      "doctor",
      "ACLI_MISSING",
      "ACLI is not installed. Install Atlassian CLI in the supported range >=1.3.15,<2.0.0.",
      EXIT.ACLI_MISSING,
    );
  }
  if (versionResult.timedOut) {
    return failure(
      "doctor",
      "ACLI_VERSION_TIMEOUT",
      `ACLI version check timed out after ${timeoutSeconds}s. Reinstall or update ACLI and retry.`,
      EXIT.TIMEOUT,
    );
  }

  const compatibility = classifyAcliVersion(versionResult.output);
  if (versionResult.status !== 0 || compatibility.reason === "unparseable") {
    return failure(
      "doctor",
      "ACLI_VERSION_UNPARSEABLE",
      `Could not determine the ACLI version. Run acli --version. Supported range: ${ACLI_SUPPORTED_RANGE}.`,
      EXIT.ACLI_UNSUPPORTED,
    );
  }
  if (!compatibility.supported) {
    return failure(
      "doctor",
      "ACLI_UNSUPPORTED",
      `ACLI ${compatibility.version.version} is unsupported. Install a version in the range ${ACLI_SUPPORTED_RANGE}.`,
      EXIT.ACLI_UNSUPPORTED,
      { version: compatibility.version.version, supported_range: ACLI_SUPPORTED_RANGE },
    );
  }

  const version = compatibility.version.version;
  const authResult = await runBounded(
    acliBinary,
    ["jira", "auth", "status"],
    deadline,
    environment,
  );
  if (authResult.timedOut) {
    return failure(
      "doctor",
      "ACLI_AUTH_TIMEOUT",
      `ACLI health check timed out after ${timeoutSeconds}s. Check the network or VPN, then run acli jira auth status.`,
      EXIT.TIMEOUT,
      { version },
    );
  }

  const sites = [
    ...new Set(
      [...authResult.output.matchAll(/([A-Za-z0-9-]+\.)+atlassian\.net/g)].map(
        (match) => match[0].toLowerCase(),
      ),
    ),
  ];
  if (authResult.status === 0 && sites.length > 0) {
    const site = sites.length === 1 ? sites[0] : null;
    return success(
      "doctor",
      { version, site, sites },
      site
        ? `ACLI ready for ${site} (version ${version}).`
        : `ACLI ready for ${sites.length} Jira sites (version ${version}): ${sites.join(", ")}.`,
    );
  }
  if (authResult.status === 0) {
    return failure(
      "doctor",
      "AUTH_SITE_MISSING",
      "ACLI reported success but did not identify a Jira site. Run acli jira auth status.",
      EXIT.ACLI_ERROR,
      { version },
    );
  }

  const lowerOutput = authResult.output.toLowerCase();
  if (
    lowerOutput.includes("site admin must authorize this app") ||
    lowerOutput.includes("site admin must re-authorize")
  ) {
    return failure(
      "doctor",
      "ADMIN_AUTHORIZATION_REQUIRED",
      "ACLI OAuth permissions require a Jira site admin to re-authorize this site. The admin must update ACLI, run acli jira auth login, choose Web, and select the affected site.",
      EXIT.ADMIN_AUTHORIZATION_REQUIRED,
      { version },
    );
  }
  if (containsAny(lowerOutput, [
    "not authenticated",
    "authentication expired",
    "authentication failed",
    "authentication required",
    "token expired",
    "login required",
    "not logged in",
    "please log in",
    "please login",
    "unauthorized",
  ])) {
    return failure(
      "doctor",
      "AUTH_REQUIRED",
      "ACLI authentication is missing or expired. Run acli jira auth login --web.",
      EXIT.AUTH_REQUIRED,
      { version },
    );
  }
  if (containsAny(lowerOutput, [
    "network",
    "connection refused",
    "connection reset",
    "unable to connect",
    "could not resolve",
    "no such host",
    "dns",
    "certificate",
    "tls",
    "timed out",
    "timeout",
  ])) {
    return failure(
      "doctor",
      "NETWORK_ERROR",
      "ACLI could not reach Jira. Check the network, VPN, proxy, and TLS settings, then retry acli jira auth status.",
      EXIT.NETWORK_ERROR,
      { version },
    );
  }
  return failure(
    "doctor",
    "ACLI_ERROR",
    `ACLI health check failed unexpectedly (exit ${authResult.status}). Run acli jira auth status manually and contact Atlassian support if it persists.`,
    EXIT.ACLI_ERROR,
    { version, acli_exit_code: authResult.status },
  );
}

function resolveKey(arguments_, environment) {
  const options = parseOptions(arguments_, new Set(["json"]), new Set(["site", "project"]));
  if (options.positionals.length !== 1) {
    return usage("resolve-key", "resolve-key requires exactly one ticket key or number");
  }
  const ticket = options.positionals[0].trim();
  if (/^[A-Za-z][A-Za-z0-9]*-\d+$/.test(ticket)) {
    const key = ticket.toUpperCase();
    return success("resolve-key", { key, source: "explicit" }, key);
  }
  if (!/^\d+$/.test(ticket)) {
    return failure(
      "resolve-key",
      "INVALID_TICKET",
      `Ticket must be a Jira key or number; received ${JSON.stringify(ticket)}.`,
      EXIT.USAGE,
    );
  }

  let project = options.values.project?.toUpperCase();
  let source = "project-option";
  if (!project) {
    if (!options.values.site) {
      return failure(
        "resolve-key",
        "SITE_REQUIRED",
        "A Jira site is required to resolve a bare ticket number without --project.",
        EXIT.SITE_REQUIRED,
      );
    }
    const store = workflowStore(environment);
    const siteConfiguration = store.get(options.values.site);
    if (!siteConfiguration || Object.keys(siteConfiguration.projects).length === 0) {
      return failure(
        "resolve-key",
        "PROJECT_REQUIRED",
        "No configured project can resolve this bare ticket number. Supply --project.",
        EXIT.PROJECT_REQUIRED,
      );
    }
    if (siteConfiguration.default_project) {
      project = siteConfiguration.default_project;
      source = "site-default";
    } else {
      const projects = Object.keys(siteConfiguration.projects);
      if (projects.length !== 1) {
        return failure(
          "resolve-key",
          "AMBIGUOUS_PROJECT",
          `Multiple projects can resolve this number: ${projects.join(", ")}. Supply --project.`,
          EXIT.AMBIGUOUS_PROJECT,
          { projects },
        );
      }
      [project] = projects;
      source = "single-configured-project";
    }
  }

  if (!/^[A-Z][A-Z0-9]*$/.test(project)) {
    return failure(
      "resolve-key",
      "INVALID_PROJECT",
      `Invalid Jira project key ${JSON.stringify(project)}.`,
      EXIT.USAGE,
    );
  }
  const key = `${project}-${ticket}`;
  return success("resolve-key", { key, source }, key);
}

function config(arguments_, environment) {
  const [operation, ...rest] = arguments_;
  if (operation === "get") return configGet(rest, environment);
  if (operation === "set") return configSet(rest, environment);
  return usage("config", "config requires get or set");
}

function configGet(arguments_, environment) {
  const options = parseOptions(arguments_, new Set(["json"]), new Set(["site", "project"]));
  requireOptions(options, ["site", "project"]);
  const configuration = workflowStore(environment).get(
    options.values.site,
    options.values.project,
  );
  if (!configuration) {
    return failure(
      "config get",
      "CONFIG_NOT_FOUND",
      `No workflow configuration exists for ${options.values.site}/${options.values.project.toUpperCase()}.`,
      EXIT.CONFIG_NOT_FOUND,
    );
  }
  return success("config get", { configuration }, "Workflow configuration found.");
}

function configSet(arguments_, environment) {
  const options = parseOptions(
    arguments_,
    new Set(["json", "default"]),
    new Set(["site", "project", "from-json"]),
  );
  requireOptions(options, ["site", "project", "from-json"]);
  let configuration;
  try {
    const source =
      options.values["from-json"] === "-"
        ? readFileSync(0, "utf8")
        : readFileSync(resolve(options.values["from-json"]), "utf8");
    configuration = JSON.parse(source);
  } catch (error) {
    return failure(
      "config set",
      "CONFIG_INPUT_INVALID",
      `Could not read workflow JSON: ${error.message}`,
      EXIT.CONFIG_INVALID,
    );
  }

  const store = workflowStore(environment);
  store.set(options.values.site, options.values.project, configuration, {
    default: options.flags.has("default"),
  });
  return success(
    "config set",
    { configuration, default: options.flags.has("default") },
    "Workflow configuration saved.",
  );
}

function workflowStore(environment) {
  return openWorkflowConfig(environment.CLAUDE_PLUGIN_DATA);
}

function parseOptions(arguments_, booleanOptions, valueOptions = new Set()) {
  const flags = new Set();
  const values = {};
  const positionals = [];
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (!argument.startsWith("--")) {
      positionals.push(argument);
      continue;
    }
    const name = argument.slice(2);
    if (booleanOptions.has(name)) {
      flags.add(name);
    } else if (valueOptions.has(name)) {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new UsageError(`--${name} requires a value`);
      values[name] = value;
      index += 1;
    } else {
      throw new UsageError(`Unknown option --${name}`);
    }
  }
  return { flags, values, positionals };
}

function requireOptions(options, names) {
  for (const name of names) {
    if (!options.values[name]) throw new UsageError(`--${name} is required`);
  }
  if (options.positionals.length > 0) throw new UsageError("Unexpected positional arguments");
}

function runBounded(binary, arguments_, deadline, environment) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.resolve({ status: null, output: "", timedOut: true });
  return new Promise((resolvePromise) => {
    let output = "";
    let settled = false;
    let child;
    let timer;
    try {
      child = spawn(binary, arguments_, { env: environment, stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      resolvePromise({ status: null, output: "", timedOut: false, missing: error.code === "ENOENT" });
      return;
    }
    const append = (chunk) => {
      if (output.length < 65_536) output += chunk.toString("utf8");
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({ status: null, output, timedOut: false, missing: error.code === "ENOENT" });
    });
    child.on("close", (status) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      resolvePromise({ status, output, timedOut: false, missing: false });
    });
    timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      resolvePromise({ status: null, output, timedOut: true, missing: false });
    }, remaining);
  });
}

function containsAny(source, values) {
  return values.some((value) => source.includes(value));
}

function success(command, data, message) {
  return {
    exitCode: EXIT.SUCCESS,
    body: { schema_version: SCHEMA_VERSION, ok: true, command, data, message },
  };
}

function failure(command, code, message, exitCode, details) {
  const error = { code, message };
  if (details) error.details = details;
  return {
    exitCode,
    body: { schema_version: SCHEMA_VERSION, ok: false, command, error, message },
  };
}

function usage(command, message) {
  return failure(command, "USAGE", message, EXIT.USAGE);
}

function mapUnexpectedError(command, error) {
  if (error instanceof UsageError) return usage(command, error.message);
  const code = error.code;
  if (code === "CONFIG_MALFORMED") {
    return failure(command, code, error.message, EXIT.CONFIG_MALFORMED);
  }
  if (code === "CONFIG_INVALID") {
    return failure(command, code, error.message, EXIT.CONFIG_INVALID);
  }
  if (code === "CONFIG_LOCK_TIMEOUT") {
    return failure(command, code, error.message, EXIT.CONFIG_LOCK_TIMEOUT);
  }
  if (code === "CONFIG_WRITE_FAILED") {
    return failure(command, code, error.message, EXIT.CONFIG_WRITE_FAILED);
  }
  return failure(
    command,
    "INTERNAL_ERROR",
    error.message || "Unexpected helper failure",
    EXIT.INTERNAL_ERROR,
  );
}

class UsageError extends Error {}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const arguments_ = process.argv.slice(2);
  const hookMode = arguments_.includes("--hook-json");
  const result = await runJiraPlugin(arguments_);
  if (hookMode) {
    process.stdout.write(
      `${JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          additionalContext: `Jira Plugin: ${result.body.message}`,
        },
      })}\n`,
    );
  } else {
    process.stdout.write(`${JSON.stringify(result.body)}\n`);
    process.exitCode = result.exitCode;
  }
}
